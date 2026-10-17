import fs from 'node:fs';
import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { logger } from '@/shared/logger/logger';
import { roundToIdxTick } from '@/modules/recommendation/service/trading-setup';
import { ADV_HARD_FLOOR_IDR } from '@/modules/eligibility/constants/eligibility.constants';
import { fetchYahooHistoryDirect } from '@/modules/technical';
import {
  normalizeYahooOhlcRows,
  selectPriceSeries,
  TRADING_PRICE_BASIS,
  type SelectedPriceBar,
} from '@/shared/market/price-basis';
import { DECISION_AGENT_VERSION } from '../types/decision-agent.types';
import {
  insertForwardSignals,
  insertForwardOutcomes,
  getSignalsPendingOutcome,
  getExistingBaselineReturn,
  getForwardLedgerTransparencySummary,
  type ForwardSignalLedgerRow,
  type InsertForwardSignalInput,
  type InsertForwardOutcomeInput,
  type PublicForwardLedgerSummary,
} from '../repository/forward-signal-ledger.repository';

export { getForwardLedgerTransparencySummary, type PublicForwardLedgerSummary };

export const FORWARD_PAPER_FEE_PCT_40 = 0.40;
export const FORWARD_PAPER_FEE_PCT_60 = 0.60;
export const FORWARD_PAPER_SLIPPAGE_BPS = 10;
export const MIN_FORWARD_OOS_SAMPLES = 30;

export function resolveCurrentGitSha(): string {
  if (process.env.GIT_SHA && process.env.GIT_SHA.trim()) {
    return process.env.GIT_SHA.trim();
  }
  try {
    if (fs.existsSync('/opt/sahamlens/deployed-sha')) {
      const sha = fs.readFileSync('/opt/sahamlens/deployed-sha', 'utf8').trim();
      if (sha) return sha;
    }
  } catch {}
  return 'unknown';
}

/**
 * Aturan acuan harga entry sesi berikutnya sesuai paper-fill:
 * BUY order terkena adverse slippage 10 bps lalu dibulatkan ke atas ke tick resmi BEI terdekat.
 */
export function calculateNextSessionEntryRef(closePrice: number): number {
  if (!Number.isFinite(closePrice) || closePrice <= 0) return 0;
  const adverseMultiplier = 1 + FORWARD_PAPER_SLIPPAGE_BPS / 10_000;
  return roundToIdxTick(closePrice * adverseMultiplier, 'up');
}

export interface SimulationResult {
  exitDate: string;
  exitPrice: number;
  exitReason: 'STOP_HIT' | 'TARGET_HIT' | 'BOTH_HIT_WORST_CASE' | 'HOLD_EXPIRY';
  stopHit: boolean;
  targetHit: boolean;
  firstHit: 'STOP' | 'TARGET' | 'NONE';
  grossReturnPct: number;
  netReturn40Pct: number;
  netReturn60Pct: number;
}

export function simulateForwardTrade(
  entryPrice: number,
  stop: number | null,
  target: number | null,
  bars: SelectedPriceBar[],
  horizon: number,
): SimulationResult | null {
  if (!bars.length || bars.length < horizon || entryPrice <= 0) return null;

  const horizonBars = bars.slice(0, horizon);
  const finalBar = horizonBars[horizon - 1];

  let outcomeReason: SimulationResult['exitReason'] = 'HOLD_EXPIRY';
  let exitPrice = finalBar.close;
  let exitDate = finalBar.date;
  let stopHit = false;
  let targetHit = false;
  let firstHit: SimulationResult['firstHit'] = 'NONE';

  if (stop != null && target != null && stop > 0 && target > entryPrice) {
    for (let d = 0; d < horizonBars.length; d++) {
      const bar = horizonBars[d];

      // Gap down di bawah stop saat open
      if (bar.open <= stop) {
        outcomeReason = 'STOP_HIT';
        exitPrice = bar.open;
        exitDate = bar.date;
        stopHit = true;
        firstHit = 'STOP';
        break;
      }

      const hitSl = bar.low <= stop;
      const hitTp = bar.high >= target;

      // Bar ambigu: keduanya tersentuh pada bar yang sama -> tie-break terburuk/konservatif (stop dulu)
      if (hitSl && hitTp) {
        outcomeReason = 'BOTH_HIT_WORST_CASE';
        exitPrice = stop;
        exitDate = bar.date;
        stopHit = true;
        targetHit = true;
        firstHit = 'STOP';
        break;
      }

      if (hitSl) {
        outcomeReason = 'STOP_HIT';
        exitPrice = stop;
        exitDate = bar.date;
        stopHit = true;
        firstHit = 'STOP';
        break;
      }

      if (hitTp) {
        outcomeReason = 'TARGET_HIT';
        exitPrice = target;
        exitDate = bar.date;
        targetHit = true;
        firstHit = 'TARGET';
        break;
      }
    }
  }

  const grossReturnPct = ((exitPrice / entryPrice) - 1) * 100;
  const netReturn40Pct = grossReturnPct - FORWARD_PAPER_FEE_PCT_40;
  const netReturn60Pct = grossReturnPct - FORWARD_PAPER_FEE_PCT_60;

  return {
    exitDate,
    exitPrice,
    exitReason: outcomeReason,
    stopHit,
    targetHit,
    firstHit,
    grossReturnPct: Number(grossReturnPct.toFixed(4)),
    netReturn40Pct: Number(netReturn40Pct.toFixed(4)),
    netReturn60Pct: Number(netReturn60Pct.toFixed(4)),
  };
}

/**
 * Pengisian cron harian setelah penutupan bursa:
 * Mengambil materialisasi sinyal terbaru per emiten pada tradeDate dari decision_agent_signals,
 * membekukan nilai skor, komponen, entry acuan sesi berikutnya, stop, target, dan liquid baseline.
 */
export async function recordDailyForwardSignals(targetDate?: string): Promise<{
  date: string;
  totalSignals: number;
  inserted: number;
  skipped: number;
  baselineRecorded: boolean;
}> {
  await ensureSharedSchema();

  let dateToRecord = targetDate;
  if (!dateToRecord) {
    const latestDateRes = await pool.query(
      `SELECT (MAX(data_as_of) AT TIME ZONE 'Asia/Jakarta')::date::text as latest
       FROM decision_agent_signals`,
    );
    dateToRecord = latestDateRes.rows[0]?.latest;
    if (!dateToRecord) {
      throw new Error('Tidak ada data sinyal di decision_agent_signals');
    }
  }

  // Ambil sinyal terbaru per emiten pada hari itu (sesi penutupan)
  const signalsRes = await pool.query(
    `SELECT DISTINCT ON (ticker)
      id,
      ticker,
      action,
      price,
      lens_score as "lensScore",
      coverage_pct as "coveragePct",
      data_as_of as "dataAsOf",
      created_at as "createdAt",
      payload
    FROM decision_agent_signals
    WHERE (data_as_of AT TIME ZONE 'Asia/Jakarta')::date = $1::date
    ORDER BY ticker, created_at DESC`,
    [dateToRecord],
  );

  const rawRows = signalsRes.rows;

  // Penjaga jumlah (CLAUDE.md §2): pemindai tak boleh lolos dengan 0 baris
  if (rawRows.length === 0) {
    throw new Error(`Penjaga jumlah: tidak ada sinyal yang ditemukan untuk tanggal ${dateToRecord} (0 baris)`);
  }

  const gitSha = resolveCurrentGitSha();
  const signalsToInsert: InsertForwardSignalInput[] = [];

  let liquidCount = 0;
  let totalLiquidAdv = 0;
  let totalLiquidScore = 0;
  let totalLiquidTech = 0;
  let totalLiquidFund = 0;
  let totalLiquidFlow = 0;
  let totalLiquidCoverage = 0;

  for (const row of rawRows) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const breakdown = (payload.scoreBreakdown ?? {}) as Record<string, unknown>;
    const risk = (payload.riskSetup ?? {}) as Record<string, unknown>;

    const closePrice = Number(row.price);
    const entryRef = calculateNextSessionEntryRef(closePrice);
    const avgValue20d = typeof payload.avgValue20d === 'number' ? payload.avgValue20d : null;
    const universeFlag = (avgValue20d ?? 0) >= ADV_HARD_FLOOR_IDR;
    const lensScore = Number(row.lensScore);
    const techScore = typeof breakdown.technical === 'number' ? breakdown.technical : null;
    const fundScore = typeof breakdown.fundamental === 'number' ? breakdown.fundamental : null;
    const flowScore = typeof breakdown.flow === 'number' ? breakdown.flow : null;
    const coveragePct = row.coveragePct != null ? Number(row.coveragePct) : null;
    const modelVersion = typeof payload.version === 'string' && payload.version ? payload.version : DECISION_AGENT_VERSION;

    const stop = typeof risk.stop === 'number' && risk.stop > 0 ? risk.stop : null;
    const target = typeof risk.target1 === 'number' && risk.target1 > 0 ? risk.target1 : null;
    const riskReward = typeof risk.riskReward === 'number' ? risk.riskReward : null;

    signalsToInsert.push({
      signalId: `fsl_${dateToRecord}_${row.ticker}_${modelVersion}`,
      tradeDate: dateToRecord,
      ticker: String(row.ticker),
      action: String(row.action),
      lensScore,
      technicalScore: techScore,
      fundamentalScore: fundScore,
      flowScore: flowScore,
      coveragePct,
      closePrice,
      entryRef,
      stop,
      target,
      riskReward,
      modelVersion,
      gitSha,
      avgValue20d,
      universeFlag,
      isBaseline: false,
      emittedAt: row.dataAsOf ? new Date(String(row.dataAsOf)).toISOString() : undefined,
    });

    if (universeFlag) {
      liquidCount += 1;
      totalLiquidAdv += avgValue20d ?? 0;
      totalLiquidScore += lensScore;
      if (techScore != null) totalLiquidTech += techScore;
      if (fundScore != null) totalLiquidFund += fundScore;
      if (flowScore != null) totalLiquidFlow += flowScore;
      if (coveragePct != null) totalLiquidCoverage += coveragePct;
    }
  }

  // Catat baseline timbang-sama emiten likuid untuk pembanding
  if (liquidCount > 0) {
    signalsToInsert.push({
      signalId: `fsl_${dateToRecord}_BASELINE_LIQUID_EQ_${DECISION_AGENT_VERSION}`,
      tradeDate: dateToRecord,
      ticker: 'BASELINE_LIQUID_EQ',
      action: 'BASELINE',
      lensScore: Number((totalLiquidScore / liquidCount).toFixed(2)),
      technicalScore: Number((totalLiquidTech / liquidCount).toFixed(2)),
      fundamentalScore: Number((totalLiquidFund / liquidCount).toFixed(2)),
      flowScore: Number((totalLiquidFlow / liquidCount).toFixed(2)),
      coveragePct: Number((totalLiquidCoverage / liquidCount).toFixed(2)),
      closePrice: 100,
      entryRef: 100,
      stop: null,
      target: null,
      riskReward: null,
      modelVersion: DECISION_AGENT_VERSION,
      gitSha,
      avgValue20d: Number((totalLiquidAdv / liquidCount).toFixed(0)),
      universeFlag: true,
      isBaseline: true,
    });
  }

  const inserted = await insertForwardSignals(signalsToInsert);
  const skipped = signalsToInsert.length - inserted;

  logger.info('Forward signal ledger berhasil dicatat', {
    tradeDate: dateToRecord,
    total: signalsToInsert.length,
    inserted,
    skipped,
    liquidCount,
  });

  return {
    date: dateToRecord,
    totalSignals: signalsToInsert.length,
    inserted,
    skipped,
    baselineRecorded: liquidCount > 0,
  };
}

async function loadTradingBarsForTicker(ticker: string, sinceDate: string): Promise<SelectedPriceBar[]> {
  try {
    const direct = await fetchYahooHistoryDirect(ticker, '1y');
    if (direct?.history?.length) {
      const normalized = normalizeYahooOhlcRows(
        direct.history,
        ticker,
        direct.regularMarketTime ? new Date(direct.regularMarketTime * 1000).toISOString() : null,
      );
      const selected = selectPriceSeries(normalized, TRADING_PRICE_BASIS);
      const barsAfter = selected.bars.filter((b) => b.date > sinceDate);
      if (barsAfter.length > 0) return barsAfter;
    }
  } catch (err) {
    logger.warn('Yahoo history direct gagal, fallback ke lens_radar_history', { ticker, err });
  }

  // Fallback ke database
  const dbRes = await pool.query(
    `SELECT
       date::text,
       COALESCE(close_price, raw_close_price, adjusted_close_price)::numeric as close
     FROM lens_radar_history
     WHERE (ticker = $1 OR ticker = $1 || '.JK') AND date > $2::date
     ORDER BY date ASC`,
    [ticker, sinceDate],
  );

  return dbRes.rows.map((r) => ({
    date: String(r.date),
    ticker,
    basis: TRADING_PRICE_BASIS,
    open: Number(r.close),
    high: Number(r.close),
    low: Number(r.close),
    close: Number(r.close),
    source: 'LENS_RADAR_HISTORY_FALLBACK',
    adjustmentVersion: 'v1',
    corporateActionStatus: 'NONE',
  }));
}

/**
 * Job terpisah: menilai outcome T+5 dan T+20 HANYA setelah horizon lewat.
 * Menegakkan no-lookahead: baris yang belum mencapai jumlah hari bursa horizon dilewati.
 */
export async function evaluateForwardOutcomes(options: { maxSignals?: number } = {}): Promise<{
  evaluatedT5: number;
  evaluatedT20: number;
  skippedNotMature: number;
}> {
  await ensureSharedSchema();
  const limit = options.maxSignals ?? 300;

  let evaluatedT5 = 0;
  let evaluatedT20 = 0;
  let skippedNotMature = 0;

  for (const horizon of ['T5', 'T20'] as const) {
    const horizonBarsCount = horizon === 'T5' ? 5 : 20;
    const pendingSignals = await getSignalsPendingOutcome(horizon, limit);

    for (const signal of pendingSignals) {
      // Sinyal baseline dievaluasi tersendiri dari rata-rata konstituen likuid
      if (signal.isBaseline) continue;

      const bars = await loadTradingBarsForTicker(signal.ticker, signal.tradeDate);

      // NO-LOOKAHEAD ENFORCEMENT:
      // Jika jumlah hari bursa setelah signal.tradeDate belum mencapai horizon, dilarang menilai!
      if (bars.length < horizonBarsCount) {
        skippedNotMature += 1;
        continue;
      }

      const sim = simulateForwardTrade(
        signal.entryRef,
        signal.stop,
        signal.target,
        bars,
        horizonBarsCount,
      );

      if (!sim) {
        skippedNotMature += 1;
        continue;
      }

      // Cari atau hitung baseline return untuk tanggal dan horizon yang sama
      let baselineReturn = await getExistingBaselineReturn(signal.tradeDate, horizon);
      if (baselineReturn == null) {
        baselineReturn = 0; // Default flat if no baseline evaluated yet
      }

      const excess40 = Number((sim.netReturn40Pct - baselineReturn).toFixed(4));
      const excess60 = Number((sim.netReturn60Pct - baselineReturn).toFixed(4));

      const outcomeInput: InsertForwardOutcomeInput = {
        signalId: signal.signalId,
        horizon,
        tradeDate: signal.tradeDate,
        exitDate: sim.exitDate,
        entryPrice: signal.entryRef,
        exitPrice: sim.exitPrice,
        grossReturnPct: sim.grossReturnPct,
        netReturn40Pct: sim.netReturn40Pct,
        netReturn60Pct: sim.netReturn60Pct,
        exitReason: sim.exitReason,
        stopHit: sim.stopHit,
        targetHit: sim.targetHit,
        firstHit: sim.firstHit,
        baselineReturnPct: baselineReturn,
        excessReturn40Pct: excess40,
        excessReturn60Pct: excess60,
      };

      const written = await insertForwardOutcomes([outcomeInput]);
      if (written > 0) {
        if (horizon === 'T5') evaluatedT5 += 1;
        else evaluatedT20 += 1;
      }
    }
  }

  logger.info('Forward outcome evaluation selesai', {
    evaluatedT5,
    evaluatedT20,
    skippedNotMature,
  });

  return { evaluatedT5, evaluatedT20, skippedNotMature };
}
