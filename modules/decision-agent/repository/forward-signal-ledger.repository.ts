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

export interface HorizonMetrics {
  count: number;
  winRatePct: number | null;
  avgNetReturnPct: number | null;
}

export interface ExitReasonMetrics {
  targetHitCount: number;
  targetHitPct: number | null;
  stopHitCount: number;
  stopHitPct: number | null;
  holdExpiryCount: number;
  holdExpiryPct: number | null;
  totalEvaluated: number;
}

export interface ShadowLedgerMetrics {
  totalSignals: number;
  t5: HorizonMetrics;
  t10: HorizonMetrics;
  t20: HorizonMetrics;
  exitReasons: ExitReasonMetrics;
}

export interface SignalOutcomeStatus {
  netReturnPct: number | null;
  grossReturnPct: number | null;
  exitReason: string | null;
  stopHit: boolean;
  targetHit: boolean;
  isEvaluated: boolean;
}

export interface ShadowLedgerSignalItem {
  signalId: string;
  tradeDate: string;
  ticker: string;
  action: string;
  closePrice: number;
  entryRef: number;
  stop: number | null;
  target: number | null;
  riskReward: number | null;
  modelVersion: string;
  universeFlag: boolean;
  createdAt: string;
  t5: SignalOutcomeStatus;
  t10: SignalOutcomeStatus;
  t20: SignalOutcomeStatus;
}

export interface ShadowLedgerCronStatus {
  jobName: string;
  title: string;
  scheduleTime: string;
  lastRunAt: string | null;
  lastFinishedAt: string | null;
  status: 'SUCCESS' | 'FAILED' | 'RUNNING' | 'NEVER_RUN';
  errorMessage: string | null;
}

export interface ShadowLedgerDashboardPayload {
  asOfDate: string | null;
  cronJobs: ShadowLedgerCronStatus[];
  modelMetrics: Record<string, ShadowLedgerMetrics>;
  signalsByModel: Record<string, ShadowLedgerSignalItem[]>;
  availableModels: string[];
}

export async function getShadowLedgerDashboardData(): Promise<ShadowLedgerDashboardPayload> {
  await ensureSharedSchema();
  try {
    const cronRes = await pool.query(`
      SELECT DISTINCT ON (job_name)
        job_name as "jobName",
        status,
        started_at as "startedAt",
        finished_at as "finishedAt",
        error_message as "errorMessage"
      FROM job_run_log
      WHERE job_name IN ('shadow-lengan-b-record', 'forward-ledger-evaluate', 'forward-ledger-record')
      ORDER BY job_name, started_at DESC
    `);

    const cronMap = new Map<string, any>();
    for (const row of cronRes.rows) {
      cronMap.set(String(row.jobName), row);
    }

    const shadowRecord = cronMap.get('shadow-lengan-b-record');
    const evaluateJob = cronMap.get('forward-ledger-evaluate');

    const cronJobs: ShadowLedgerCronStatus[] = [
      {
        jobName: 'shadow-lengan-b-record',
        title: 'Rekam Sinyal Harian (Lengan B)',
        scheduleTime: '16:35 WIB (Senin - Jumat)',
        lastRunAt: shadowRecord?.startedAt ? new Date(shadowRecord.startedAt).toISOString() : null,
        lastFinishedAt: shadowRecord?.finishedAt ? new Date(shadowRecord.finishedAt).toISOString() : null,
        status: (shadowRecord?.status as any) || 'NEVER_RUN',
        errorMessage: shadowRecord?.errorMessage ? String(shadowRecord.errorMessage) : null,
      },
      {
        jobName: 'forward-ledger-evaluate',
        title: 'Evaluasi Outcome Forward',
        scheduleTime: '17:30 WIB (Senin - Jumat)',
        lastRunAt: evaluateJob?.startedAt ? new Date(evaluateJob.startedAt).toISOString() : null,
        lastFinishedAt: evaluateJob?.finishedAt ? new Date(evaluateJob.finishedAt).toISOString() : null,
        status: (evaluateJob?.status as any) || 'NEVER_RUN',
        errorMessage: evaluateJob?.errorMessage ? String(evaluateJob.errorMessage) : null,
      },
    ];

    const metricsPerModelRes = await pool.query(`
      SELECT
        s.model_version as "modelVersion",
        COUNT(DISTINCT s.signal_id)::int as "totalSignals",
        COUNT(DISTINCT CASE WHEN o.horizon = 'T5' THEN s.signal_id END)::int as "t5Count",
        AVG(CASE WHEN o.horizon = 'T5' THEN o.net_return_60_pct END) as "t5AvgNet",
        COUNT(DISTINCT CASE WHEN o.horizon = 'T5' AND o.net_return_60_pct > 0 THEN s.signal_id END)::int as "t5Wins",
        COUNT(DISTINCT CASE WHEN o.horizon = 'T10' THEN s.signal_id END)::int as "t10Count",
        AVG(CASE WHEN o.horizon = 'T10' THEN o.net_return_60_pct END) as "t10AvgNet",
        COUNT(DISTINCT CASE WHEN o.horizon = 'T10' AND o.net_return_60_pct > 0 THEN s.signal_id END)::int as "t10Wins",
        COUNT(DISTINCT CASE WHEN o.horizon = 'T20' THEN s.signal_id END)::int as "t20Count",
        AVG(CASE WHEN o.horizon = 'T20' THEN o.net_return_60_pct END) as "t20AvgNet",
        COUNT(DISTINCT CASE WHEN o.horizon = 'T20' AND o.net_return_60_pct > 0 THEN s.signal_id END)::int as "t20Wins",
        COUNT(DISTINCT CASE WHEN o.target_hit = true OR o.exit_reason = 'TARGET_HIT' THEN o.signal_id || '_' || o.horizon END)::int as "targetHitCount",
        COUNT(DISTINCT CASE WHEN o.stop_hit = true OR o.exit_reason = 'STOP_HIT' THEN o.signal_id || '_' || o.horizon END)::int as "stopHitCount",
        COUNT(DISTINCT CASE WHEN o.exit_reason = 'HOLD_EXPIRY' THEN o.signal_id || '_' || o.horizon END)::int as "holdExpiryCount",
        COUNT(DISTINCT o.signal_id || '_' || o.horizon)::int as "totalOutcomes"
      FROM forward_signal_ledger s
      LEFT JOIN forward_signal_outcome o ON o.signal_id = s.signal_id
      GROUP BY s.model_version
    `);

    const allMetricsRes = await pool.query(`
      SELECT
        COUNT(DISTINCT s.signal_id)::int as "totalSignals",
        COUNT(DISTINCT CASE WHEN o.horizon = 'T5' THEN s.signal_id END)::int as "t5Count",
        AVG(CASE WHEN o.horizon = 'T5' THEN o.net_return_60_pct END) as "t5AvgNet",
        COUNT(DISTINCT CASE WHEN o.horizon = 'T5' AND o.net_return_60_pct > 0 THEN s.signal_id END)::int as "t5Wins",
        COUNT(DISTINCT CASE WHEN o.horizon = 'T10' THEN s.signal_id END)::int as "t10Count",
        AVG(CASE WHEN o.horizon = 'T10' THEN o.net_return_60_pct END) as "t10AvgNet",
        COUNT(DISTINCT CASE WHEN o.horizon = 'T10' AND o.net_return_60_pct > 0 THEN s.signal_id END)::int as "t10Wins",
        COUNT(DISTINCT CASE WHEN o.horizon = 'T20' THEN s.signal_id END)::int as "t20Count",
        AVG(CASE WHEN o.horizon = 'T20' THEN o.net_return_60_pct END) as "t20AvgNet",
        COUNT(DISTINCT CASE WHEN o.horizon = 'T20' AND o.net_return_60_pct > 0 THEN s.signal_id END)::int as "t20Wins",
        COUNT(DISTINCT CASE WHEN o.target_hit = true OR o.exit_reason = 'TARGET_HIT' THEN o.signal_id || '_' || o.horizon END)::int as "targetHitCount",
        COUNT(DISTINCT CASE WHEN o.stop_hit = true OR o.exit_reason = 'STOP_HIT' THEN o.signal_id || '_' || o.horizon END)::int as "stopHitCount",
        COUNT(DISTINCT CASE WHEN o.exit_reason = 'HOLD_EXPIRY' THEN o.signal_id || '_' || o.horizon END)::int as "holdExpiryCount",
        COUNT(DISTINCT o.signal_id || '_' || o.horizon)::int as "totalOutcomes",
        MAX(s.trade_date)::text as "latestTradeDate"
      FROM forward_signal_ledger s
      LEFT JOIN forward_signal_outcome o ON o.signal_id = s.signal_id
    `);

    function buildMetrics(row: any): ShadowLedgerMetrics {
      const totalSignals = Number(row?.totalSignals || 0);
      const t5Count = Number(row?.t5Count || 0);
      const t5Wins = Number(row?.t5Wins || 0);
      const t10Count = Number(row?.t10Count || 0);
      const t10Wins = Number(row?.t10Wins || 0);
      const t20Count = Number(row?.t20Count || 0);
      const t20Wins = Number(row?.t20Wins || 0);
      const totalOutcomes = Number(row?.totalOutcomes || 0);
      const targetHitCount = Number(row?.targetHitCount || 0);
      const stopHitCount = Number(row?.stopHitCount || 0);
      const holdExpiryCount = Number(row?.holdExpiryCount || 0);

      return {
        totalSignals,
        t5: {
          count: t5Count,
          winRatePct: t5Count > 0 ? roundTo((t5Wins / t5Count) * 100, 1) : null,
          avgNetReturnPct: roundTo(asNum(row?.t5AvgNet), 2),
        },
        t10: {
          count: t10Count,
          winRatePct: t10Count > 0 ? roundTo((t10Wins / t10Count) * 100, 1) : null,
          avgNetReturnPct: roundTo(asNum(row?.t10AvgNet), 2),
        },
        t20: {
          count: t20Count,
          winRatePct: t20Count > 0 ? roundTo((t20Wins / t20Count) * 100, 1) : null,
          avgNetReturnPct: roundTo(asNum(row?.t20AvgNet), 2),
        },
        exitReasons: {
          targetHitCount,
          targetHitPct: totalOutcomes > 0 ? roundTo((targetHitCount / totalOutcomes) * 100, 1) : null,
          stopHitCount,
          stopHitPct: totalOutcomes > 0 ? roundTo((stopHitCount / totalOutcomes) * 100, 1) : null,
          holdExpiryCount,
          holdExpiryPct: totalOutcomes > 0 ? roundTo((holdExpiryCount / totalOutcomes) * 100, 1) : null,
          totalEvaluated: totalOutcomes,
        },
      };
    }

    const modelMetrics: Record<string, ShadowLedgerMetrics> = {};
    const availableModelsSet = new Set<string>(['shadow-lengan-b-v1']);

    for (const r of metricsPerModelRes.rows) {
      const mv = String(r.modelVersion);
      availableModelsSet.add(mv);
      modelMetrics[mv] = buildMetrics(r);
    }

    if (!modelMetrics['shadow-lengan-b-v1']) {
      modelMetrics['shadow-lengan-b-v1'] = {
        totalSignals: 0,
        t5: { count: 0, winRatePct: null, avgNetReturnPct: null },
        t10: { count: 0, winRatePct: null, avgNetReturnPct: null },
        t20: { count: 0, winRatePct: null, avgNetReturnPct: null },
        exitReasons: {
          targetHitCount: 0,
          targetHitPct: null,
          stopHitCount: 0,
          stopHitPct: null,
          holdExpiryCount: 0,
          holdExpiryPct: null,
          totalEvaluated: 0,
        },
      };
    }

    modelMetrics['all'] = buildMetrics(allMetricsRes.rows[0]);

    const signalsRes = await pool.query(`
      WITH ranked_signals AS (
        SELECT
          s.signal_id,
          s.trade_date::text as trade_date,
          s.ticker,
          s.action,
          s.close_price,
          s.entry_ref,
          s.stop,
          s.target,
          s.risk_reward,
          s.model_version,
          s.universe_flag,
          s.created_at,
          ROW_NUMBER() OVER (PARTITION BY s.model_version ORDER BY s.trade_date DESC, s.created_at DESC, s.ticker ASC) as rn
        FROM forward_signal_ledger s
      )
      SELECT
        r.signal_id as "signalId",
        r.trade_date as "tradeDate",
        r.ticker,
        r.action,
        r.close_price as "closePrice",
        r.entry_ref as "entryRef",
        r.stop,
        r.target,
        r.risk_reward as "riskReward",
        r.model_version as "modelVersion",
        r.universe_flag as "universeFlag",
        r.created_at as "createdAt",
        o_t5.net_return_60_pct as "t5Net",
        o_t5.gross_return_pct as "t5Gross",
        o_t5.exit_reason as "t5Reason",
        o_t5.stop_hit as "t5StopHit",
        o_t5.target_hit as "t5TargetHit",
        o_t10.net_return_60_pct as "t10Net",
        o_t10.gross_return_pct as "t10Gross",
        o_t10.exit_reason as "t10Reason",
        o_t10.stop_hit as "t10StopHit",
        o_t10.target_hit as "t10TargetHit",
        o_t20.net_return_60_pct as "t20Net",
        o_t20.gross_return_pct as "t20Gross",
        o_t20.exit_reason as "t20Reason",
        o_t20.stop_hit as "t20StopHit",
        o_t20.target_hit as "t20TargetHit"
      FROM ranked_signals r
      LEFT JOIN forward_signal_outcome o_t5 ON o_t5.signal_id = r.signal_id AND o_t5.horizon = 'T5'
      LEFT JOIN forward_signal_outcome o_t10 ON o_t10.signal_id = r.signal_id AND o_t10.horizon = 'T10'
      LEFT JOIN forward_signal_outcome o_t20 ON o_t20.signal_id = r.signal_id AND o_t20.horizon = 'T20'
      WHERE r.rn <= 150
      ORDER BY r.trade_date DESC, r.created_at DESC, r.ticker ASC
    `);

    const allSignals: ShadowLedgerSignalItem[] = signalsRes.rows.map((row) => ({
      signalId: String(row.signalId),
      tradeDate: String(row.tradeDate),
      ticker: String(row.ticker),
      action: String(row.action),
      closePrice: Number(row.closePrice),
      entryRef: Number(row.entryRef),
      stop: asNum(row.stop),
      target: asNum(row.target),
      riskReward: asNum(row.riskReward),
      modelVersion: String(row.modelVersion),
      universeFlag: Boolean(row.universeFlag),
      createdAt: new Date(String(row.createdAt)).toISOString(),
      t5: {
        netReturnPct: roundTo(asNum(row.t5Net), 2),
        grossReturnPct: roundTo(asNum(row.t5Gross), 2),
        exitReason: row.t5Reason ? String(row.t5Reason) : null,
        stopHit: Boolean(row.t5StopHit),
        targetHit: Boolean(row.t5TargetHit),
        isEvaluated: row.t5Net != null,
      },
      t10: {
        netReturnPct: roundTo(asNum(row.t10Net), 2),
        grossReturnPct: roundTo(asNum(row.t10Gross), 2),
        exitReason: row.t10Reason ? String(row.t10Reason) : null,
        stopHit: Boolean(row.t10StopHit),
        targetHit: Boolean(row.t10TargetHit),
        isEvaluated: row.t10Net != null,
      },
      t20: {
        netReturnPct: roundTo(asNum(row.t20Net), 2),
        grossReturnPct: roundTo(asNum(row.t20Gross), 2),
        exitReason: row.t20Reason ? String(row.t20Reason) : null,
        stopHit: Boolean(row.t20StopHit),
        targetHit: Boolean(row.t20TargetHit),
        isEvaluated: row.t20Net != null,
      },
    }));

    const signalsByModel: Record<string, ShadowLedgerSignalItem[]> = {
      all: allSignals,
    };
    for (const m of availableModelsSet) {
      signalsByModel[m] = allSignals.filter((s) => s.modelVersion === m);
    }

    const latestDate = allMetricsRes.rows[0]?.latestTradeDate
      ? String(allMetricsRes.rows[0].latestTradeDate)
      : null;

    return {
      asOfDate: latestDate,
      cronJobs,
      modelMetrics,
      signalsByModel,
      availableModels: Array.from(availableModelsSet),
    };
  } catch (error) {
    logger.error('Gagal mengambil data dashboard shadow ledger', { err: error });
    return {
      asOfDate: null,
      cronJobs: [
        {
          jobName: 'shadow-lengan-b-record',
          title: 'Rekam Sinyal Harian (Lengan B)',
          scheduleTime: '16:35 WIB (Senin - Jumat)',
          lastRunAt: null,
          lastFinishedAt: null,
          status: 'NEVER_RUN',
          errorMessage: null,
        },
        {
          jobName: 'forward-ledger-evaluate',
          title: 'Evaluasi Outcome Forward',
          scheduleTime: '17:30 WIB (Senin - Jumat)',
          lastRunAt: null,
          lastFinishedAt: null,
          status: 'NEVER_RUN',
          errorMessage: null,
        },
      ],
      modelMetrics: {
        'shadow-lengan-b-v1': {
          totalSignals: 0,
          t5: { count: 0, winRatePct: null, avgNetReturnPct: null },
          t10: { count: 0, winRatePct: null, avgNetReturnPct: null },
          t20: { count: 0, winRatePct: null, avgNetReturnPct: null },
          exitReasons: {
            targetHitCount: 0,
            targetHitPct: null,
            stopHitCount: 0,
            stopHitPct: null,
            holdExpiryCount: 0,
            holdExpiryPct: null,
            totalEvaluated: 0,
          },
        },
        all: {
          totalSignals: 0,
          t5: { count: 0, winRatePct: null, avgNetReturnPct: null },
          t10: { count: 0, winRatePct: null, avgNetReturnPct: null },
          t20: { count: 0, winRatePct: null, avgNetReturnPct: null },
          exitReasons: {
            targetHitCount: 0,
            targetHitPct: null,
            stopHitCount: 0,
            stopHitPct: null,
            holdExpiryCount: 0,
            holdExpiryPct: null,
            totalEvaluated: 0,
          },
        },
      },
      signalsByModel: {
        'shadow-lengan-b-v1': [],
        all: [],
      },
      availableModels: ['shadow-lengan-b-v1'],
    };
  }
}
