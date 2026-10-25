import fs from 'node:fs';
import path from 'node:path';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { logger } from '@/shared/logger/logger';
import { todayDateKeyWIB } from '@/shared/market/trading-session';
import { getEmitenBoard } from '@/shared/market/emiten-list';
import { classifyTradingBoard } from '@/lib/utils/idx-trading-board';
import { getTickerUmaStatus } from '@/modules/market/service/uma-status.service';
import {
  fetchTradingViewScan,
  fetchTradingViewIhsg,
  type TradingViewStockItem,
} from '@/modules/market-data/service/tradingview-scanner.service';
import { fetchYahooHistoryDirect } from '@/modules/technical';
import { calculateWilderAtr } from '@/modules/technical/service/atr';
import { buildLongTradingSetup, roundToIdxTick } from '@/modules/recommendation/service/trading-setup';
import { calculateNextSessionEntryRef, resolveCurrentGitSha } from './forward-signal-ledger.service';
import {
  insertForwardSignals,
  type InsertForwardSignalInput,
} from '../repository/forward-signal-ledger.repository';
import { recordProviderSuccess } from '@/shared/http/provider-circuit-breaker';

export const MODEL_VERSION_SHADOW_LENGAN_B = 'shadow-lengan-b-v1';
export const SHADOW_LENGAN_B_ADV_FLOOR = 5_000_000_000; // Rp 5 Miliar
export const SHADOW_LENGAN_B_MIN_PRICE = 100; // Rp 100 anti-gocap
export const SHADOW_LENGAN_B_MIN_MCAP = 1_000_000_000_000; // Rp 1 Triliun anti-microcap
export const SHADOW_LENGAN_B_MIN_RR = 1.8;
export const SHADOW_LENGAN_B_MAX_RAW_RISK_PCT = 12.0;
export const SHADOW_LENGAN_B_STOP_TARGET_PCT = 0.055; // 5.5% target stop loss (rentang 3.5% - 6.0%)
export const SHADOW_LENGAN_B_TOP_N = 10;
export const DEFAULT_ACTIVE_UMA_WINDOW_DAYS = 7;

export interface ShadowLenganBSignal {
  ticker: string;
  close: number;
  entryRef: number;
  stop: number;
  target: number;
  rr: number;
  riskPct: number;
  compositeScore: number;
  rsRank: number;
  cmfRank: number;
  avgValue20d: number;
}

export interface ExecuteShadowLenganBOptions {
  date?: string;
  dryRun?: boolean;
  bypassRegime?: boolean;
}

export interface ExecuteShadowLenganBResult {
  success: boolean;
  regimePassed: boolean;
  date: string;
  signalsCount: number;
  insertedCount: number;
  candidatesEvaluated: number;
  signals: ShadowLenganBSignal[];
  reason?: string;
}

export function chaikinMoneyFlow20(
  history: Array<{ High?: number; Low?: number; Close?: number; Volume?: number }>,
): number {
  const window = history.slice(-20);
  if (window.length === 0) return 0;
  let mfvSum = 0;
  let volSum = 0;
  for (const h of window) {
    const high = h.High ?? 0;
    const low = h.Low ?? 0;
    const close = h.Close ?? 0;
    const vol = h.Volume ?? 0;
    const range = high - low;
    const mfm = range > 0 ? ((close - low) - (high - close)) / range : 0;
    mfvSum += mfm * vol;
    volSum += vol;
  }
  return volSum > 0 ? Number(((mfvSum / volSum) * 100).toFixed(2)) : 0;
}

export function loadSuspendedTickersSet(baseDir = process.cwd()): Set<string> {
  try {
    const filePath = path.join(baseDir, 'data', 'idx-suspension', 'suspension-index.json');
    if (!fs.existsSync(filePath)) return new Set();
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as { suspendedTickers?: string[] };
    return new Set(Array.isArray(parsed.suspendedTickers) ? parsed.suspendedTickers : []);
  } catch {
    return new Set();
  }
}

/**
 * Filter kelayakan Hard Gates Lengan B (Anti-Microcap + Anti-FCA):
 * 1. ADV 20D >= Rp 5 Miliar
 * 2. Stage 2: Close > SMA50 && Close > SMA200
 * 3. Pengaman 1: Close >= 100 (anti-gocap) && Market Cap >= 1T (anti-microcap)
 * 4. Pengaman 2: Tolak Papan Pemantauan Khusus (FCA), Notasi Khusus X, suspensi aktif, dan UMA <= 7 hari
 */
export function isEligibleShadowLenganB(
  stock: TradingViewStockItem,
  suspendedSet: Set<string>,
): boolean {
  const ticker = stock.ticker;
  const close = stock.close;
  const mcap = stock.marketCap;
  const turnover = stock.turnover;
  const sma50 = stock.sma50;
  const sma200 = stock.sma200;

  if (close == null || close < SHADOW_LENGAN_B_MIN_PRICE) return false;
  if (mcap == null || mcap < SHADOW_LENGAN_B_MIN_MCAP) return false;
  if (turnover == null || turnover < SHADOW_LENGAN_B_ADV_FLOOR) return false;
  if (sma50 == null || sma200 == null || close <= sma50 || close <= sma200) return false;

  // Anti-FCA & Notasi Khusus X
  const board = getEmitenBoard(ticker);
  const boardInfo = classifyTradingBoard(board);
  if (boardInfo?.isFca || board?.toLowerCase().includes('pemantauan khusus')) return false;
  if (suspendedSet.has(ticker)) return false;

  // Anti-UMA Guard <= 7 hari
  const uma = getTickerUmaStatus(ticker, { activeWindowDays: DEFAULT_ACTIVE_UMA_WINDOW_DAYS });
  if (uma.isUma) return false;

  return true;
}

/**
 * Eksekusi harian Shadow Forward Ledger Lengan B.
 * Sinyal yang lolos dicatat ke `forward_signal_ledger` dengan `model_version = 'shadow-lengan-b-v1'`.
 */
export async function executeShadowLenganB(
  options: ExecuteShadowLenganBOptions = {},
): Promise<ExecuteShadowLenganBResult> {
  await ensureSharedSchema();
  // Pulihkan circuit breaker jika sempat terbuka karena panggilan transient
  await recordProviderSuccess('YAHOO_CHART');

  const tradeDate = options.date ?? todayDateKeyWIB();
  const dryRun = Boolean(options.dryRun);
  const bypassRegime = Boolean(options.bypassRegime);

  const [ihsg, stocks] = await Promise.all([
    fetchTradingViewIhsg(),
    fetchTradingViewScan({ minTurnoverIdr: 0 }),
  ]);

  const ihsgClose = ihsg?.close ?? null;
  const ihsgSma50 = ihsg?.sma50 ?? null;
  const regimePassed = Boolean(ihsgClose != null && ihsgSma50 != null && ihsgClose > ihsgSma50);

  if (!regimePassed && !bypassRegime) {
    logger.info('Rezim pasar bearish (IHSG <= SMA-50). Shadow Lengan B dilewati.', {
      tradeDate,
      ihsgClose,
      ihsgSma50,
    });
    return {
      success: true,
      regimePassed: false,
      date: tradeDate,
      signalsCount: 0,
      insertedCount: 0,
      candidatesEvaluated: 0,
      signals: [],
      reason: 'IHSG_DOWNTREND',
    };
  }

  const suspendedSet = loadSuspendedTickersSet();
  const passedGates = stocks.filter((s) => isEligibleShadowLenganB(s, suspendedSet));

  if (passedGates.length === 0) {
    logger.info('Tidak ada emiten yang lolos Hard Gates Lengan B.', { tradeDate });
    return {
      success: true,
      regimePassed,
      date: tradeDate,
      signalsCount: 0,
      insertedCount: 0,
      candidatesEvaluated: 0,
      signals: [],
      reason: 'NO_GATE_PASS',
    };
  }

  // Ambil histori 1y bar per emiten untuk kalkulasi CMF-20 dan TradePlan
  const candidatePromises = passedGates.map(async (s) => {
    try {
      const yfTicker = s.ticker.endsWith('.JK') ? s.ticker : `${s.ticker}.JK`;
      const yh = await fetchYahooHistoryDirect(yfTicker, '1y');
      if (!yh?.history || yh.history.length < 20) return null;
      const cmf20 = chaikinMoneyFlow20(yh.history);
      const perf63 = s.perf3M ?? 0;
      return {
        stock: s,
        history: yh.history,
        cmf20,
        perf63,
        rsRank: 0,
        cmfRank: 0,
        compositeScore: 0,
      };
    } catch {
      return null;
    }
  });

  const rawCandidates = await Promise.all(candidatePromises);
  const candidates = rawCandidates.filter(Boolean) as Array<NonNullable<(typeof rawCandidates)[number]>>;

  if (candidates.length === 0) {
    logger.warn('Gagal memuat histori harga kandidat Lengan B.', { tradeDate });
    return {
      success: true,
      regimePassed,
      date: tradeDate,
      signalsCount: 0,
      insertedCount: 0,
      candidatesEvaluated: 0,
      signals: [],
      reason: 'NO_HISTORY_AVAILABLE',
    };
  }

  // 1. Ranking RS (perf 63 hari / 3M)
  const n = candidates.length;
  candidates.sort((a, b) => a.perf63 - b.perf63);
  candidates.forEach((c, idx) => {
    c.rsRank = n > 1 ? Number(((idx / (n - 1)) * 100).toFixed(2)) : 50;
  });

  // 2. Ranking CMF-20
  candidates.sort((a, b) => a.cmf20 - b.cmf20);
  candidates.forEach((c, idx) => {
    c.cmfRank = n > 1 ? Number(((idx / (n - 1)) * 100).toFixed(2)) : 50;
    c.compositeScore = Number(((c.rsRank + c.cmfRank) / 2).toFixed(2));
  });

  // Urutkan menurun berdasarkan skor komposit dan ambil TOP 10
  candidates.sort((a, b) => b.compositeScore - a.compositeScore);
  const top10 = candidates.slice(0, SHADOW_LENGAN_B_TOP_N);

  // 3. Evaluasi TradePlan v1.0 & filter RR >= 1.8
  const signals: ShadowLenganBSignal[] = [];

  for (const c of top10) {
    const s = c.stock;
    const history = c.history;
    const close = s.close;
    if (close == null || close <= 0) continue;

    const entryRef = calculateNextSessionEntryRef(close);
    const atr = calculateWilderAtr(
      history.map((h) => ({ high: h.High ?? 0, low: h.Low ?? 0, close: h.Close ?? 0 })),
    );

    const swingHistory = history.map((h) => ({
      High: h.High ?? 0,
      Low: h.Low ?? 0,
      Close: h.Close ?? 0,
      Date: h.Date ?? '',
    }));

    const setup = buildLongTradingSetup(swingHistory, close, atr, { minLongRr: 1.5 });
    if (!setup) continue;

    const rawRiskPct = ((entryRef - setup.stop) / entryRef) * 100;
    if (rawRiskPct > SHADOW_LENGAN_B_MAX_RAW_RISK_PCT) {
      // Tolak risiko mentah berlebihan (volatilitas ekstrem / microcap trap)
      continue;
    }

    let finalStop = setup.stop;
    let finalRiskPct = rawRiskPct;
    if (finalRiskPct > 6.0) {
      finalStop = roundToIdxTick(entryRef * (1 - SHADOW_LENGAN_B_STOP_TARGET_PCT), 'down');
      finalRiskPct = ((entryRef - finalStop) / entryRef) * 100;
    } else if (finalRiskPct < 3.5) {
      finalStop = roundToIdxTick(entryRef * (1 - 0.035), 'down');
      finalRiskPct = ((entryRef - finalStop) / entryRef) * 100;
    }

    const finalTarget = setup.tp1;
    const finalRr = parseFloat(((finalTarget - entryRef) / (entryRef - finalStop)).toFixed(2));

    if (finalRr >= SHADOW_LENGAN_B_MIN_RR) {
      signals.push({
        ticker: s.ticker,
        close,
        entryRef,
        stop: finalStop,
        target: finalTarget,
        rr: finalRr,
        riskPct: parseFloat(finalRiskPct.toFixed(2)),
        compositeScore: c.compositeScore,
        rsRank: c.rsRank,
        cmfRank: c.cmfRank,
        avgValue20d: s.turnover ?? 0,
      });
    }
  }

  let insertedCount = 0;
  if (!dryRun && signals.length > 0) {
    const gitSha = resolveCurrentGitSha();
    const signalsToInsert: InsertForwardSignalInput[] = signals.map((sig) => ({
      signalId: `fsl_${tradeDate}_${sig.ticker}_${MODEL_VERSION_SHADOW_LENGAN_B}`,
      tradeDate,
      ticker: sig.ticker,
      action: 'BUY',
      lensScore: sig.compositeScore,
      technicalScore: sig.rsRank,
      fundamentalScore: null,
      flowScore: sig.cmfRank,
      coveragePct: 100,
      closePrice: sig.close,
      entryRef: sig.entryRef,
      stop: sig.stop,
      target: sig.target,
      riskReward: sig.rr,
      modelVersion: MODEL_VERSION_SHADOW_LENGAN_B,
      gitSha,
      avgValue20d: sig.avgValue20d,
      universeFlag: true,
      isBaseline: false,
      emittedAt: new Date().toISOString(),
    }));

    insertedCount = await insertForwardSignals(signalsToInsert);
    logger.info('Shadow Lengan B sinyal berhasil dicatat ke forward_signal_ledger', {
      tradeDate,
      modelVersion: MODEL_VERSION_SHADOW_LENGAN_B,
      signalsCount: signals.length,
      insertedCount,
    });
  }

  return {
    success: true,
    regimePassed,
    date: tradeDate,
    signalsCount: signals.length,
    insertedCount,
    candidatesEvaluated: candidates.length,
    signals,
  };
}
