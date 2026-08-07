import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { todayDateKeyWIB } from '@/shared/market/trading-session';
import {
  calculateCalibrationObservations,
  decorrelateCalibrationObservations,
  welchOneTailedGreater,
  type CalibrationObservation,
} from './calibration.service';
import type { LensRadarHistoryEntry, LensScoreBucket } from './bucket-backtest.service';

const LOOKBACK_DAYS = 90;
const CURRENT_WEIGHTS: LensScoreWeights = { technical: 40, fundamental: 30, flow: 30 };
const COMPONENT_MAX = { technical: 40, fundamental: 30, flow: 30 } as const;
const MIN_BUCKET_SAMPLE = 2;
const MIN_OOS_BUCKET_SAMPLE = 10;
const TRAIN_FRACTION = 0.7;
const OOS_MAX_P_VALUE = 0.10;

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export interface LensScoreWeights {
  technical: number;
  fundamental: number;
  flow: number;
}

export interface WeightOptimizationSample {
  ticker: string;
  signalDate: string;
  returnT20: number;
  technicalScore: number;
  fundamentalScore: number;
  flowScore: number;
}

export interface WeightCandidateResult {
  weights: LensScoreWeights;
  spreadT20: number | null;
  pValue: number | null;
  highAvgT20: number | null;
  lowAvgT20: number | null;
  highSamples: number;
  lowSamples: number;
  totalSamples: number;
}

export interface LensWeightProposal {
  id?: number;
  runDate: string;
  status: 'PENDING_APPROVAL' | 'INSUFFICIENT_STATS' | 'INSUFFICIENT_COMPONENT_HISTORY' | 'NO_VALID_CANDIDATE';
  reason: string;
  baselineWeights: LensScoreWeights;
  proposedWeights: LensScoreWeights | null;
  baselineSpreadT20: number | null;
  proposedSpreadT20: number | null;
  baselinePValue: number | null;
  proposedPValue: number | null;
  baselineSampleSize: number;
  proposedSampleSize: number;
  componentSampleSize: number;
  candidateCount: number;
  lookbackDays: number;
  statsWindowStart: string | null;
  statsWindowEnd: string | null;
  createdAt?: string;
}

interface LensRadarHistoryWithComponents extends LensRadarHistoryEntry {
  technical_score: number | string | null;
  fundamental_score: number | string | null;
  flow_score: number | string | null;
  coverage_pct: number | string | null;
}

function finiteNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateKey(value: string | Date | null | undefined): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  }
  if (typeof value !== 'string') return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundNumber(value: number | null, digits = 4): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function bucketFor(score: number): LensScoreBucket | null {
  if (!Number.isFinite(score) || score < 0 || score > 100) return null;
  if (score >= 80) return '80-100';
  if (score >= 70) return '70-79';
  if (score >= 60) return '60-69';
  return '<60';
}

export function generateWeightCandidates(step = 5): LensScoreWeights[] {
  const candidates: LensScoreWeights[] = [];
  for (let technical = 20; technical <= 60; technical += step) {
    for (let fundamental = 10; fundamental <= 50; fundamental += step) {
      const flow = 100 - technical - fundamental;
      if (flow < 10 || flow > 50) continue;
      candidates.push({ technical, fundamental, flow });
    }
  }
  if (!candidates.some((w) => w.technical === 40 && w.fundamental === 30 && w.flow === 30)) {
    candidates.push(CURRENT_WEIGHTS);
  }
  return candidates;
}

function weightedScore(sample: WeightOptimizationSample, weights: LensScoreWeights): number {
  const technicalQuality = (sample.technicalScore / COMPONENT_MAX.technical) * 100;
  const fundamentalQuality = (sample.fundamentalScore / COMPONENT_MAX.fundamental) * 100;
  const flowQuality = (sample.flowScore / COMPONENT_MAX.flow) * 100;
  const score = (
    technicalQuality * weights.technical +
    fundamentalQuality * weights.fundamental +
    flowQuality * weights.flow
  ) / 100;
  return Math.max(0, Math.min(100, score));
}

export function evaluateWeightCandidate(
  samples: WeightOptimizationSample[],
  weights: LensScoreWeights
): WeightCandidateResult {
  const high: number[] = [];
  const low: number[] = [];
  for (const sample of samples) {
    const bucket = bucketFor(weightedScore(sample, weights));
    if (bucket === '80-100') high.push(sample.returnT20);
    if (bucket === '<60') low.push(sample.returnT20);
  }

  const highAvg = average(high);
  const lowAvg = average(low);
  const tTest = welchOneTailedGreater(high, low);
  const spread = highAvg != null && lowAvg != null ? highAvg - lowAvg : null;

  return {
    weights,
    spreadT20: roundNumber(spread, 4),
    pValue: tTest.pValue,
    highAvgT20: roundNumber(highAvg, 4),
    lowAvgT20: roundNumber(lowAvg, 4),
    highSamples: high.length,
    lowSamples: low.length,
    totalSamples: high.length + low.length,
  };
}

function isUsableCandidate(candidate: WeightCandidateResult): boolean {
  return candidate.spreadT20 != null
    && candidate.pValue != null
    && candidate.highSamples >= MIN_BUCKET_SAMPLE
    && candidate.lowSamples >= MIN_BUCKET_SAMPLE;
}

export function optimizeLensScoreWeights(samples: WeightOptimizationSample[]): {
  baseline: WeightCandidateResult;
  best: WeightCandidateResult | null;
  candidates: WeightCandidateResult[];
} {
  const candidates = generateWeightCandidates().map((weights) => evaluateWeightCandidate(samples, weights));
  const baseline = evaluateWeightCandidate(samples, CURRENT_WEIGHTS);
  const usable = candidates.filter(isUsableCandidate);
  const best = usable.sort((a, b) => {
    const spreadDiff = (b.spreadT20 ?? -Infinity) - (a.spreadT20 ?? -Infinity);
    if (Math.abs(spreadDiff) > 0.0001) return spreadDiff;
    return (a.pValue ?? 1) - (b.pValue ?? 1);
  })[0] ?? null;
  return { baseline, best, candidates };
}

function sampleKey(ticker: string, date: string): string {
  return `${ticker.toUpperCase()}|${date}`;
}

export function chronologicalTrainOosSplit(samples: WeightOptimizationSample[], trainFraction = TRAIN_FRACTION): { train: WeightOptimizationSample[]; oos: WeightOptimizationSample[]; splitDate: string | null } {
  const orderedDates = Array.from(new Set(samples.map((s) => s.signalDate))).sort();
  if (orderedDates.length < 3) return { train: [], oos: [], splitDate: null };
  const splitIndex = Math.min(orderedDates.length - 2, Math.max(0, Math.floor(orderedDates.length * trainFraction) - 1));
  const splitDate = orderedDates[splitIndex] ?? null;
  if (!splitDate) return { train: [], oos: [], splitDate: null };
  return {
    train: samples.filter((s) => s.signalDate <= splitDate),
    oos: samples.filter((s) => s.signalDate > splitDate),
    splitDate,
  };
}

function passesOosGate(candidate: WeightCandidateResult, baseline: WeightCandidateResult): boolean {
  return candidate.spreadT20 != null
    && baseline.spreadT20 != null
    && candidate.highSamples >= MIN_OOS_BUCKET_SAMPLE
    && candidate.lowSamples >= MIN_OOS_BUCKET_SAMPLE
    && candidate.pValue != null
    && candidate.pValue <= OOS_MAX_P_VALUE
    && candidate.spreadT20 > 0
    && candidate.spreadT20 > baseline.spreadT20;
}

function buildOptimizationSamples(
  rows: LensRadarHistoryWithComponents[],
  observations: CalibrationObservation[]
): WeightOptimizationSample[] {
  const components = new Map<string, LensRadarHistoryWithComponents>();
  for (const row of rows) {
    const date = dateKey(row.date);
    const ticker = typeof row.ticker === 'string' ? row.ticker.trim().toUpperCase() : '';
    if (!date || !ticker) continue;
    components.set(sampleKey(ticker, date), row);
  }

  const samples: WeightOptimizationSample[] = [];
  for (const obs of observations) {
    if (typeof obs.returnT20 !== 'number') continue;
    const row = components.get(sampleKey(obs.ticker, obs.signalDate));
    if (!row) continue;
    const technicalScore = finiteNumber(row.technical_score);
    const fundamentalScore = finiteNumber(row.fundamental_score);
    const flowScore = finiteNumber(row.flow_score);
    if (technicalScore == null || fundamentalScore == null || flowScore == null) continue;
    samples.push({
      ticker: obs.ticker,
      signalDate: obs.signalDate,
      returnT20: obs.returnT20,
      technicalScore,
      fundamentalScore,
      flowScore,
    });
  }
  return samples;
}

async function readRecentBucketStats(db: Queryable = pool, lookbackDays = LOOKBACK_DAYS): Promise<{ start: string | null; end: string | null; days: number }> {
  const { rows } = await db.query(
    `
    SELECT MIN(run_date)::text AS start, MAX(run_date)::text AS end, COUNT(DISTINCT run_date)::int AS days
    FROM lens_bucket_stats
    WHERE run_date >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
    `,
    [lookbackDays]
  );
  return {
    start: dateKey(rows[0]?.start ?? null),
    end: dateKey(rows[0]?.end ?? null),
    days: Number(rows[0]?.days ?? 0),
  };
}

async function readHistoryRowsForWindow(db: Queryable = pool, startDate: string | null): Promise<LensRadarHistoryWithComponents[]> {
  const { rows } = await db.query(
    `
    SELECT
      "date",
      ticker,
      lens_score,
      close_price,
      market_cap,
      technical_score,
      fundamental_score,
      flow_score,
      coverage_pct
    FROM lens_radar_history
    WHERE lens_score IS NOT NULL
      AND close_price IS NOT NULL
      AND ($1::date IS NULL OR "date" >= $1::date)
    ORDER BY ticker ASC, "date" ASC
    `,
    [startDate]
  );
  return rows as LensRadarHistoryWithComponents[];
}

function buildProposal(params: {
  status: LensWeightProposal['status'];
  reason: string;
  runDate: string;
  baseline?: WeightCandidateResult;
  best?: WeightCandidateResult | null;
  componentSampleSize: number;
  candidateCount: number;
  statsWindowStart: string | null;
  statsWindowEnd: string | null;
}): LensWeightProposal {
  const baseline = params.baseline ?? evaluateWeightCandidate([], CURRENT_WEIGHTS);
  const best = params.best ?? null;
  return {
    runDate: params.runDate,
    status: params.status,
    reason: params.reason,
    baselineWeights: CURRENT_WEIGHTS,
    proposedWeights: params.status === 'PENDING_APPROVAL' ? best?.weights ?? null : null,
    baselineSpreadT20: baseline.spreadT20,
    proposedSpreadT20: params.status === 'PENDING_APPROVAL' ? best?.spreadT20 ?? null : null,
    baselinePValue: baseline.pValue,
    proposedPValue: params.status === 'PENDING_APPROVAL' ? best?.pValue ?? null : null,
    baselineSampleSize: baseline.totalSamples,
    proposedSampleSize: params.status === 'PENDING_APPROVAL' ? best?.totalSamples ?? 0 : 0,
    componentSampleSize: params.componentSampleSize,
    candidateCount: params.candidateCount,
    lookbackDays: LOOKBACK_DAYS,
    statsWindowStart: params.statsWindowStart,
    statsWindowEnd: params.statsWindowEnd,
  };
}

export async function saveWeightProposal(proposal: LensWeightProposal, db: Queryable = pool): Promise<LensWeightProposal> {
  await ensureSharedSchema();
  const { rows } = await db.query(
    `
    INSERT INTO lens_weight_proposals (
      run_date, status, reason, baseline_weights, proposed_weights,
      baseline_spread_t20, proposed_spread_t20, baseline_p_value, proposed_p_value,
      baseline_sample_size, proposed_sample_size, component_sample_size, candidate_count,
      lookback_days, stats_window_start, stats_window_end
    )
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING id, created_at::text
    `,
    [
      proposal.runDate,
      proposal.status,
      proposal.reason,
      JSON.stringify(proposal.baselineWeights),
      proposal.proposedWeights ? JSON.stringify(proposal.proposedWeights) : null,
      proposal.baselineSpreadT20,
      proposal.proposedSpreadT20,
      proposal.baselinePValue,
      proposal.proposedPValue,
      proposal.baselineSampleSize,
      proposal.proposedSampleSize,
      proposal.componentSampleSize,
      proposal.candidateCount,
      proposal.lookbackDays,
      proposal.statsWindowStart,
      proposal.statsWindowEnd,
    ]
  );
  return { ...proposal, id: Number(rows[0]?.id), createdAt: rows[0]?.created_at };
}

export async function runLensScoreOptimizer(db: Queryable = pool): Promise<LensWeightProposal> {
  await ensureSharedSchema();
  const runDate = todayDateKeyWIB();
  const statsWindow = await readRecentBucketStats(db);
  const candidateCount = generateWeightCandidates().length;

  if (statsWindow.days === 0) {
    return saveWeightProposal(buildProposal({
      status: 'INSUFFICIENT_STATS',
      reason: 'Belum ada lens_bucket_stats dalam 90 hari terakhir, optimizer tidak membuat proposal bobot.',
      runDate,
      componentSampleSize: 0,
      candidateCount,
      statsWindowStart: statsWindow.start,
      statsWindowEnd: statsWindow.end,
    }), db);
  }

  const rows = await readHistoryRowsForWindow(db, statsWindow.start);
  const { observations } = await calculateCalibrationObservations(rows);
  // Optimizer memakai observasi T+20 yang didekorelasikan agar sinyal harian overlap
  // dari ticker yang sama tidak memperbesar effective sample size secara semu.
  const effectiveObservations = decorrelateCalibrationObservations(
    observations.filter((obs) => typeof obs.returnT20 === 'number')
  );
  const samples = buildOptimizationSamples(rows, effectiveObservations);
  if (samples.length < MIN_BUCKET_SAMPLE * 2) {
    return saveWeightProposal(buildProposal({
      status: 'INSUFFICIENT_COMPONENT_HISTORY',
      reason: 'Histori komponen technical/fundamental/flow belum cukup untuk simulasi bobot. Tunggu ai-pick-scan mengarsipkan breakdown komponen beberapa hari bursa.',
      runDate,
      componentSampleSize: samples.length,
      candidateCount,
      statsWindowStart: statsWindow.start,
      statsWindowEnd: statsWindow.end,
    }), db);
  }

  const split = chronologicalTrainOosSplit(samples);
  if (!split.splitDate || split.train.length < MIN_BUCKET_SAMPLE * 2 || split.oos.length < MIN_OOS_BUCKET_SAMPLE * 2) {
    return saveWeightProposal(buildProposal({
      status: 'INSUFFICIENT_COMPONENT_HISTORY',
      reason: 'Histori belum cukup untuk chronological train/OOS split yang fail-closed. Optimizer tidak membuat proposal sampai OOS memadai.',
      runDate,
      componentSampleSize: samples.length,
      candidateCount,
      statsWindowStart: statsWindow.start,
      statsWindowEnd: statsWindow.end,
    }), db);
  }

  // Pemilihan kandidat HANYA menggunakan train set. OOS tidak boleh ikut memilih bobot.
  const trainOptimization = optimizeLensScoreWeights(split.train);
  if (!trainOptimization.best) {
    return saveWeightProposal(buildProposal({
      status: 'NO_VALID_CANDIDATE',
      reason: `Tidak ada kandidat valid pada train set (split sampai ${split.splitDate}). OOS tidak disentuh untuk pemilihan kandidat.`,
      runDate,
      baseline: trainOptimization.baseline,
      componentSampleSize: samples.length,
      candidateCount: trainOptimization.candidates.length,
      statsWindowStart: statsWindow.start,
      statsWindowEnd: statsWindow.end,
    }), db);
  }

  // Setelah kandidat dibekukan dari train, baru evaluasi SEKALI pada OOS.
  const oosBaseline = evaluateWeightCandidate(split.oos, CURRENT_WEIGHTS);
  const oosCandidate = evaluateWeightCandidate(split.oos, trainOptimization.best.weights);
  if (!passesOosGate(oosCandidate, oosBaseline)) {
    return saveWeightProposal(buildProposal({
      status: 'NO_VALID_CANDIDATE',
      reason: `Kandidat train gagal OOS gate setelah ${split.splitDate}: perlu >= ${MIN_OOS_BUCKET_SAMPLE} sampel per bucket, spread OOS positif, p-value OOS <= ${OOS_MAX_P_VALUE}, dan spread OOS harus mengungguli baseline. Bobot production tidak berubah.`,
      runDate,
      baseline: oosBaseline,
      componentSampleSize: samples.length,
      candidateCount: trainOptimization.candidates.length,
      statsWindowStart: statsWindow.start,
      statsWindowEnd: statsWindow.end,
    }), db);
  }

  return saveWeightProposal(buildProposal({
    status: 'PENDING_APPROVAL',
    reason: `Proposal lolos chronological OOS gate setelah split ${split.splitDate}. Kandidat dipilih hanya dari train; metrik proposal di bawah adalah hasil OOS. Tetap perlu approval manual admin.`,
    runDate,
    baseline: oosBaseline,
    best: oosCandidate,
    componentSampleSize: samples.length,
    candidateCount: trainOptimization.candidates.length,
    statsWindowStart: statsWindow.start,
    statsWindowEnd: statsWindow.end,
  }), db);
}

function parseWeights(value: unknown): LensScoreWeights | null {
  if (!value) return null;
  const obj = typeof value === 'string' ? JSON.parse(value) : value as any;
  const technical = finiteNumber(obj.technical);
  const fundamental = finiteNumber(obj.fundamental);
  const flow = finiteNumber(obj.flow);
  if (technical == null || fundamental == null || flow == null) return null;
  return { technical, fundamental, flow };
}

export async function getLatestWeightProposal(db: Queryable = pool): Promise<LensWeightProposal | null> {
  await ensureSharedSchema();
  const { rows } = await db.query(
    `
    SELECT
      id,
      run_date::text,
      status,
      reason,
      baseline_weights,
      proposed_weights,
      baseline_spread_t20,
      proposed_spread_t20,
      baseline_p_value,
      proposed_p_value,
      baseline_sample_size,
      proposed_sample_size,
      component_sample_size,
      candidate_count,
      lookback_days,
      stats_window_start::text,
      stats_window_end::text,
      created_at::text
    FROM lens_weight_proposals
    ORDER BY created_at DESC
    LIMIT 1
    `
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    runDate: dateKey(row.run_date) ?? '',
    status: row.status,
    reason: row.reason ?? '',
    baselineWeights: parseWeights(row.baseline_weights) ?? CURRENT_WEIGHTS,
    proposedWeights: parseWeights(row.proposed_weights),
    baselineSpreadT20: roundNumber(finiteNumber(row.baseline_spread_t20)),
    proposedSpreadT20: roundNumber(finiteNumber(row.proposed_spread_t20)),
    baselinePValue: roundNumber(finiteNumber(row.baseline_p_value)),
    proposedPValue: roundNumber(finiteNumber(row.proposed_p_value)),
    baselineSampleSize: Number(row.baseline_sample_size ?? 0),
    proposedSampleSize: Number(row.proposed_sample_size ?? 0),
    componentSampleSize: Number(row.component_sample_size ?? 0),
    candidateCount: Number(row.candidate_count ?? 0),
    lookbackDays: Number(row.lookback_days ?? LOOKBACK_DAYS),
    statsWindowStart: dateKey(row.stats_window_start),
    statsWindowEnd: dateKey(row.stats_window_end),
    createdAt: row.created_at,
  };
}
