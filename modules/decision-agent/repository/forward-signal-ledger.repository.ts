import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { logger } from '@/shared/logger/logger';

export interface ForwardSignalLedgerRow {
  signalId: string;
  emittedAt: string;
  tradeDate: string;
  ticker: string;
  action: string;
  lensScore: number;
  technicalScore: number | null;
  fundamentalScore: number | null;
  flowScore: number | null;
  coveragePct: number | null;
  closePrice: number;
  entryRef: number;
  stop: number | null;
  target: number | null;
  riskReward: number | null;
  modelVersion: string;
  gitSha: string | null;
  avgValue20d: number | null;
  universeFlag: boolean;
  isBaseline: boolean;
  createdAt: string;
}

export interface ForwardSignalOutcomeRow {
  signalId: string;
  horizon: 'T5' | 'T20';
  evaluatedAt: string;
  tradeDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  grossReturnPct: number;
  netReturn40Pct: number;
  netReturn60Pct: number;
  exitReason: string;
  stopHit: boolean;
  targetHit: boolean;
  firstHit: 'STOP' | 'TARGET' | 'NONE';
  baselineReturnPct: number | null;
  excessReturn40Pct: number | null;
  excessReturn60Pct: number | null;
}

export interface InsertForwardSignalInput {
  signalId: string;
  tradeDate: string;
  ticker: string;
  action: string;
  lensScore: number;
  technicalScore?: number | null;
  fundamentalScore?: number | null;
  flowScore?: number | null;
  coveragePct?: number | null;
  closePrice: number;
  entryRef: number;
  stop?: number | null;
  target?: number | null;
  riskReward?: number | null;
  modelVersion: string;
  gitSha?: string | null;
  avgValue20d?: number | null;
  universeFlag: boolean;
  isBaseline: boolean;
  emittedAt?: string;
}

export interface InsertForwardOutcomeInput {
  signalId: string;
  horizon: 'T5' | 'T20';
  tradeDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  grossReturnPct: number;
  netReturn40Pct: number;
  netReturn60Pct: number;
  exitReason: string;
  stopHit: boolean;
  targetHit: boolean;
  firstHit: 'STOP' | 'TARGET' | 'NONE';
  baselineReturnPct?: number | null;
  excessReturn40Pct?: number | null;
  excessReturn60Pct?: number | null;
}

export interface PublicForwardLedgerSummary {
  asOfDate: string | null;
  modelStatus: 'RESEARCH_ONLY';
  totalEmittedSignals: number;
  totalCandidateSignals: number;
  totalEvaluatedT5: number;
  totalEvaluatedT20: number;
  insufficientSample: boolean;
  sampleStatus: string;
  minimumRequiredSamples: number;
  metricsT20: {
    samples: number;
    medianNet40Pct: number | null;
    meanNet40Pct: number | null;
    medianNet60Pct: number | null;
    meanNet60Pct: number | null;
    winRatePct: number | null;
    excessVsBaselineMeanPct: number | null;
    ci95RoughPct: {
      lower: number | null;
      upper: number | null;
    } | null;
  };
  metricsT5: {
    samples: number;
    meanNet60Pct: number | null;
    winRatePct: number | null;
  };
  firstSignalDate: string | null;
  latestSignalDate: string | null;
  methodologyNote: string;
}

function asNum(val: unknown): number | null {
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export async function insertForwardSignals(signals: InsertForwardSignalInput[]): Promise<number> {
  if (!signals.length) return 0;
  await ensureSharedSchema();
  let inserted = 0;

  for (const s of signals) {
    const res = await pool.query(
      `INSERT INTO forward_signal_ledger (
        signal_id, emitted_at, trade_date, ticker, action,
        lens_score, technical_score, fundamental_score, flow_score, coverage_pct,
        close_price, entry_ref, stop, target, risk_reward,
        model_version, git_sha, avg_value_20d, universe_flag, is_baseline
      ) VALUES (
        $1, COALESCE($2::timestamptz, now()), $3::date, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20
      )
      ON CONFLICT (trade_date, ticker, model_version) DO NOTHING
      RETURNING 1`,
      [
        s.signalId,
        s.emittedAt ?? null,
        s.tradeDate,
        s.ticker,
        s.action,
        s.lensScore,
        s.technicalScore ?? null,
        s.fundamentalScore ?? null,
        s.flowScore ?? null,
        s.coveragePct ?? null,
        s.closePrice,
        s.entryRef,
        s.stop ?? null,
        s.target ?? null,
        s.riskReward ?? null,
        s.modelVersion,
        s.gitSha ?? null,
        s.avgValue20d ?? null,
        s.universeFlag,
        s.isBaseline,
      ],
    );
    if ((res.rowCount ?? 0) > 0) inserted += 1;
  }

  return inserted;
}

export async function insertForwardOutcomes(outcomes: InsertForwardOutcomeInput[]): Promise<number> {
  if (!outcomes.length) return 0;
  await ensureSharedSchema();
  let inserted = 0;

  for (const o of outcomes) {
    const res = await pool.query(
      `INSERT INTO forward_signal_outcome (
        signal_id, horizon, evaluated_at, trade_date, exit_date,
        entry_price, exit_price, gross_return_pct, net_return_40_pct, net_return_60_pct,
        exit_reason, stop_hit, target_hit, first_hit,
        baseline_return_pct, excess_return_40_pct, excess_return_60_pct
      ) VALUES (
        $1, $2, now(), $3::date, $4::date,
        $5, $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16
      )
      ON CONFLICT (signal_id, horizon) DO NOTHING
      RETURNING 1`,
      [
        o.signalId,
        o.horizon,
        o.tradeDate,
        o.exitDate,
        o.entryPrice,
        o.exitPrice,
        o.grossReturnPct,
        o.netReturn40Pct,
        o.netReturn60Pct,
        o.exitReason,
        o.stopHit,
        o.targetHit,
        o.firstHit,
        o.baselineReturnPct ?? null,
        o.excessReturn40Pct ?? null,
        o.excessReturn60Pct ?? null,
      ],
    );
    if ((res.rowCount ?? 0) > 0) inserted += 1;
  }

  return inserted;
}

export async function getSignalsPendingOutcome(horizon: 'T5' | 'T20', limit = 200): Promise<ForwardSignalLedgerRow[]> {
  await ensureSharedSchema();
  const res = await pool.query(
    `SELECT
      signal_id as "signalId",
      emitted_at as "emittedAt",
      trade_date::text as "tradeDate",
      ticker,
      action,
      lens_score as "lensScore",
      technical_score as "technicalScore",
      fundamental_score as "fundamentalScore",
      flow_score as "flowScore",
      coverage_pct as "coveragePct",
      close_price as "closePrice",
      entry_ref as "entryRef",
      stop,
      target,
      risk_reward as "riskReward",
      model_version as "modelVersion",
      git_sha as "gitSha",
      avg_value_20d as "avgValue20d",
      universe_flag as "universeFlag",
      is_baseline as "isBaseline",
      created_at as "createdAt"
    FROM forward_signal_ledger s
    WHERE NOT EXISTS (
      SELECT 1 FROM forward_signal_outcome o
      WHERE o.signal_id = s.signal_id AND o.horizon = $1
    )
    ORDER BY s.trade_date ASC, s.ticker ASC
    LIMIT $2`,
    [horizon, limit],
  );

  return res.rows.map((r) => ({
    signalId: String(r.signalId),
    emittedAt: new Date(String(r.emittedAt)).toISOString(),
    tradeDate: String(r.tradeDate),
    ticker: String(r.ticker),
    action: String(r.action),
    lensScore: Number(r.lensScore),
    technicalScore: asNum(r.technicalScore),
    fundamentalScore: asNum(r.fundamentalScore),
    flowScore: asNum(r.flowScore),
    coveragePct: asNum(r.coveragePct),
    closePrice: Number(r.closePrice),
    entryRef: Number(r.entryRef),
    stop: asNum(r.stop),
    target: asNum(r.target),
    riskReward: asNum(r.riskReward),
    modelVersion: String(r.modelVersion),
    gitSha: r.gitSha ? String(r.gitSha) : null,
    avgValue20d: asNum(r.avgValue20d),
    universeFlag: Boolean(r.universeFlag),
    isBaseline: Boolean(r.isBaseline),
    createdAt: new Date(String(r.createdAt)).toISOString(),
  }));
}

export async function getExistingBaselineReturn(tradeDate: string, horizon: 'T5' | 'T20'): Promise<number | null> {
  await ensureSharedSchema();
  const res = await pool.query(
    `SELECT net_return_60_pct as "netReturn"
     FROM forward_signal_outcome o
     JOIN forward_signal_ledger s ON s.signal_id = o.signal_id
     WHERE s.is_baseline = true AND o.trade_date = $1::date AND o.horizon = $2
     LIMIT 1`,
    [tradeDate, horizon],
  );
  if (!res.rows.length) return null;
  return asNum(res.rows[0].netReturn);
}

function calculateMedian(arr: number[]): number | null {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calculateMean(arr: number[]): number | null {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function roundTo(num: number | null, decimals = 2): number | null {
  if (num == null || !Number.isFinite(num)) return null;
  const factor = 10 ** decimals;
  return Math.round(num * factor) / factor;
}

export async function getForwardLedgerTransparencySummary(): Promise<PublicForwardLedgerSummary> {
  await ensureSharedSchema();
  try {
    const countsRes = await pool.query(`
      SELECT
        COUNT(*)::int as "totalEmitted",
        COUNT(*) FILTER (WHERE action = 'BUY_CANDIDATE' AND is_baseline = false)::int as "totalCandidates",
        MIN(trade_date)::text as "firstDate",
        MAX(trade_date)::text as "latestDate"
      FROM forward_signal_ledger
    `);

    const c = countsRes.rows[0] ?? {};
    const totalEmittedSignals = Number(c.totalEmitted ?? 0);
    const totalCandidateSignals = Number(c.totalCandidates ?? 0);
    const firstSignalDate = c.firstDate ? String(c.firstDate) : null;
    const latestSignalDate = c.latestDate ? String(c.latestDate) : null;

    const outcomesT20Res = await pool.query(`
      SELECT
        o.net_return_40_pct as "net40",
        o.net_return_60_pct as "net60",
        o.excess_return_60_pct as "excess60"
      FROM forward_signal_outcome o
      JOIN forward_signal_ledger s ON s.signal_id = o.signal_id
      WHERE o.horizon = 'T20' AND s.action = 'BUY_CANDIDATE' AND s.is_baseline = false
    `);

    const outcomesT5Res = await pool.query(`
      SELECT
        o.net_return_60_pct as "net60"
      FROM forward_signal_outcome o
      JOIN forward_signal_ledger s ON s.signal_id = o.signal_id
      WHERE o.horizon = 'T5' AND s.action = 'BUY_CANDIDATE' AND s.is_baseline = false
    `);

    const t20Rows = outcomesT20Res.rows;
    const net40List = t20Rows.map((r) => Number(r.net40)).filter(Number.isFinite);
    const net60List = t20Rows.map((r) => Number(r.net60)).filter(Number.isFinite);
    const excess60List = t20Rows.map((r) => Number(r.excess60)).filter(Number.isFinite);
    const nT20 = net60List.length;

    const t5Rows = outcomesT5Res.rows;
    const net60ListT5 = t5Rows.map((r) => Number(r.net60)).filter(Number.isFinite);
    const nT5 = net60ListT5.length;

    const meanNet60 = calculateMean(net60List);
    const medianNet60 = calculateMedian(net60List);
    const meanNet40 = calculateMean(net40List);
    const medianNet40 = calculateMedian(net40List);
    const winRateT20 = nT20 > 0 ? (net60List.filter((v) => v > 0).length / nT20) * 100 : null;
    const excessVsBaselineMean = calculateMean(excess60List);

    let ci95: { lower: number; upper: number } | null = null;
    if (nT20 >= 5 && meanNet60 != null) {
      const variance = net60List.reduce((acc, v) => acc + (v - meanNet60) ** 2, 0) / (nT20 - 1);
      const stdErr = Math.sqrt(variance / nT20);
      ci95 = {
        lower: Number((meanNet60 - 1.96 * stdErr).toFixed(2)),
        upper: Number((meanNet60 + 1.96 * stdErr).toFixed(2)),
      };
    }

    const meanNet60T5 = calculateMean(net60ListT5);
    const winRateT5 = nT5 > 0 ? (net60ListT5.filter((v) => v > 0).length / nT5) * 100 : null;

    const insufficientSample = nT20 < 30;
    const sampleStatus = insufficientSample
      ? `n < 30: belum cukup (${nT20} trade T+20 matang; minimum 30 sampel OOS untuk evaluasi)`
      : `${nT20} sampel T+20 forward matang`;

    return {
      asOfDate: latestSignalDate,
      modelStatus: 'RESEARCH_ONLY',
      totalEmittedSignals,
      totalCandidateSignals,
      totalEvaluatedT5: nT5,
      totalEvaluatedT20: nT20,
      insufficientSample,
      sampleStatus,
      minimumRequiredSamples: 30,
      metricsT20: {
        samples: nT20,
        medianNet40Pct: roundTo(medianNet40),
        meanNet40Pct: roundTo(meanNet40),
        medianNet60Pct: roundTo(medianNet60),
        meanNet60Pct: roundTo(meanNet60),
        winRatePct: roundTo(winRateT20, 1),
        excessVsBaselineMeanPct: roundTo(excessVsBaselineMean),
        ci95RoughPct: ci95,
      },
      metricsT5: {
        samples: nT5,
        meanNet60Pct: roundTo(meanNet60T5),
        winRatePct: roundTo(winRateT5, 1),
      },
      firstSignalDate,
      latestSignalDate,
      methodologyNote:
        'Sinyal dibekukan point-in-time pada penutupan sesi harian ke tabel append-only. Outcome dinilai di tabel terpisah strictly setelah horizon T+5 / T+20 lewat tanpa lookahead. Biaya netto: 0,40% fee + slippage (0,60% round-trip).',
    };
  } catch (error) {
    logger.error('Gagal mengambil ringkasan forward ledger', { err: error });
    return {
      asOfDate: null,
      modelStatus: 'RESEARCH_ONLY',
      totalEmittedSignals: 0,
      totalCandidateSignals: 0,
      totalEvaluatedT5: 0,
      totalEvaluatedT20: 0,
      insufficientSample: true,
      sampleStatus: 'n < 30: belum cukup (tabel ledger belum terisi)',
      minimumRequiredSamples: 30,
      metricsT20: {
        samples: 0,
        medianNet40Pct: null,
        meanNet40Pct: null,
        medianNet60Pct: null,
        meanNet60Pct: null,
        winRatePct: null,
        excessVsBaselineMeanPct: null,
        ci95RoughPct: null,
      },
      metricsT5: {
        samples: 0,
        meanNet60Pct: null,
        winRatePct: null,
      },
      firstSignalDate: null,
      latestSignalDate: null,
      methodologyNote: 'Append-only forward paper-trade ledger. Belum ada sampel.',
    };
  }
}
