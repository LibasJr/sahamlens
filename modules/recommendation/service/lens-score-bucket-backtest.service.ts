import { pool } from '../../../shared/database/postgres.client';
import { logger } from '../../../shared/logger/logger';
import { SCORE_VERSION, partitionByScoreVersion } from '../../lens-radar/constants/model-version';
import { RETURN_PRICE_BASIS, type PriceBasis } from '../../../shared/market/price-basis';

export const LENS_SCORE_ROUND_TRIP_COST_PCT = 0.5; // fee 0.4% + slippage 0.1%
export const LENS_SCORE_MIN_HISTORY_DAYS = 90;

export type LensScoreBucketKey = '80-100' | '70-79' | '60-69' | '<60';
export type LensScoreHorizonKey = 't1' | 't5' | 't20';

const BUCKET_ORDER: LensScoreBucketKey[] = ['80-100', '70-79', '60-69', '<60'];
const HORIZONS: Record<LensScoreHorizonKey, number> = { t1: 1, t5: 5, t20: 20 };

export interface LensRadarHistoryRow {
  date: string | Date;
  ticker: string;
  lens_score: number | string;
  close_price: number | string;
  score_version?: string | null;
  adjusted_close_price?: number | string | null;
  raw_close_price?: number | string | null;
  price_basis?: PriceBasis | string | null;
}

export interface BucketHorizonStats {
  avgReturnPct: number | null;
  winRatePct: number | null;
  samples: number;
}

export interface LensScoreBucketStats {
  bucket: LensScoreBucketKey;
  horizons: Record<LensScoreHorizonKey, BucketHorizonStats>;
}

export interface TTestResult {
  horizon: LensScoreHorizonKey;
  comparison: '80-100_vs_60-69';
  meanDiffPct: number | null;
  tStatistic: number | null;
  degreesOfFreedom: number | null;
  pValueApprox: number | null;
  significantAt5Pct: boolean;
  bucket80Better: boolean | null;
  samples80: number;
  samples60: number;
  note: string;
}

export interface LensScoreBucketBacktestResult {
  ready: boolean;
  scoreVersion: string | null;
  requestedScoreVersion: string;
  rejectedRows: number;
  unversionedRows: number;
  versionMixed: boolean;
  versionRejectedReason: string | null;
  minRequiredDays: number;
  coverageDays: number;
  tradingDays: number;
  minDate: string | null;
  maxDate: string | null;
  rowsRead: number;
  roundTripCostPct: number;
  entryRule: string;
  buckets: LensScoreBucketStats[];
  tTests: Record<LensScoreHorizonKey, TTestResult>;
  note: string | null;
}

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: LensRadarHistoryRow[] }>;
}

function toDateKey(value: string | Date): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  }
  if (typeof value !== 'string') return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function assignBucket(score: number): LensScoreBucketKey | null {
  if (!Number.isFinite(score) || score < 0 || score > 100) return null;
  if (score >= 80) return '80-100';
  if (score >= 70) return '70-79';
  if (score >= 60) return '60-69';
  return '<60';
}

function initReturns(): Record<LensScoreBucketKey, Record<LensScoreHorizonKey, number[]>> {
  return BUCKET_ORDER.reduce((acc, bucket) => {
    acc[bucket] = { t1: [], t5: [], t20: [] };
    return acc;
  }, {} as Record<LensScoreBucketKey, Record<LensScoreHorizonKey, number[]>>);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function sampleVariance(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = average(values);
  if (mean == null) return null;
  return values.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (values.length - 1);
}

function round(value: number | null, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function erf(x: number): number {
  // Abramowitz-Stegun approximation; cukup untuk p-value indikatif di UI scanner.
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * abs);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-abs * abs);
  return sign * y;
}

function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function welchTTest(
  high: number[],
  baseline: number[],
  horizon: LensScoreHorizonKey
): TTestResult {
  const empty: TTestResult = {
    horizon,
    comparison: '80-100_vs_60-69',
    meanDiffPct: null,
    tStatistic: null,
    degreesOfFreedom: null,
    pValueApprox: null,
    significantAt5Pct: false,
    bucket80Better: null,
    samples80: high.length,
    samples60: baseline.length,
    note: 'Sampel belum cukup untuk Welch t-test sederhana.',
  };

  if (high.length < 2 || baseline.length < 2) return empty;
  const meanHigh = average(high);
  const meanBase = average(baseline);
  const varHigh = sampleVariance(high);
  const varBase = sampleVariance(baseline);
  if (meanHigh == null || meanBase == null || varHigh == null || varBase == null) return empty;

  const se2 = varHigh / high.length + varBase / baseline.length;
  if (!Number.isFinite(se2) || se2 <= 0) return {
    ...empty,
    meanDiffPct: round(meanHigh - meanBase),
    bucket80Better: meanHigh > meanBase,
    note: 'Variansi sampel nol; t-statistic tidak bermakna.',
  };

  const t = (meanHigh - meanBase) / Math.sqrt(se2);
  const numerator = se2 ** 2;
  const denominator =
    (varHigh ** 2) / (high.length ** 2 * (high.length - 1)) +
    (varBase ** 2) / (baseline.length ** 2 * (baseline.length - 1));
  const df = denominator > 0 ? numerator / denominator : null;
  // p-value memakai normal approximation dua sisi. Untuk dashboard scanner, angka ini
  // cukup sebagai indikator awal; validasi final tetap harus memakai statistik penuh.
  const pValueApprox = 2 * (1 - normalCdf(Math.abs(t)));

  return {
    horizon,
    comparison: '80-100_vs_60-69',
    meanDiffPct: round(meanHigh - meanBase),
    tStatistic: round(t, 3),
    degreesOfFreedom: round(df, 1),
    pValueApprox: round(pValueApprox, 4),
    significantAt5Pct: pValueApprox < 0.05,
    bucket80Better: meanHigh > meanBase,
    samples80: high.length,
    samples60: baseline.length,
    note: 'Welch t-test sederhana; p-value memakai normal approximation dua sisi.',
  };
}

export function computeLensScoreBucketBacktest(
  rows: LensRadarHistoryRow[],
  options: { scoreVersion?: string | null } = {}
): LensScoreBucketBacktestResult {
  const requestedScoreVersion = options.scoreVersion?.trim() || SCORE_VERSION;
  const partition = partitionByScoreVersion(Array.isArray(rows) ? rows : [], requestedScoreVersion);
  const normalized = partition.accepted
    .map((row) => {
      const date = toDateKey(row.date);
      const score = toFiniteNumber(row.lens_score);
      const close = toFiniteNumber(row.adjusted_close_price);
      const ticker = typeof row.ticker === 'string' ? row.ticker.trim().toUpperCase() : '';
      if (!date || !ticker || row.price_basis !== RETURN_PRICE_BASIS || score == null || close == null || close <= 0) return null;
      const bucket = assignBucket(score);
      if (!bucket) return null;
      return { date, ticker, score, close, bucket };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.ticker.localeCompare(b.ticker) || a.date.localeCompare(b.date));

  const uniqueDates = Array.from(new Set(normalized.map((row) => row.date))).sort();
  const minDate = uniqueDates[0] ?? null;
  const maxDate = uniqueDates[uniqueDates.length - 1] ?? null;
  const coverageDays = minDate && maxDate
    ? Math.round((Date.parse(`${maxDate}T00:00:00Z`) - Date.parse(`${minDate}T00:00:00Z`)) / 86_400_000) + 1
    : 0;
  const returns = initReturns();

  const byTicker = new Map<string, typeof normalized>();
  for (const row of normalized) {
    const list = byTicker.get(row.ticker) ?? [];
    list.push(row);
    byTicker.set(row.ticker, list);
  }

  for (const series of Array.from(byTicker.values())) {
    for (let i = 0; i < series.length; i++) {
      const signal = series[i];
      if (!signal) continue;
      const entryIndex = i + 1;
      const entry = series[entryIndex];
      if (!entry) continue;

      for (const [horizonKey, holdingDays] of Object.entries(HORIZONS) as [LensScoreHorizonKey, number][]) {
        // Sinyal diketahui setelah close T. Entry memakai close sesi berikutnya (H+1).
        // Horizon 1/5/20 dihitung sebagai hari bursa SETELAH entry aktual agar T+1
        // bukan return nol yang cuma berisi biaya transaksi.
        const exit = series[entryIndex + holdingDays];
        if (!exit) continue;
        const grossPct = ((exit.close / entry.close) - 1) * 100;
        returns[signal.bucket][horizonKey].push(grossPct - LENS_SCORE_ROUND_TRIP_COST_PCT);
      }
    }
  }

  const buckets = BUCKET_ORDER.map((bucket): LensScoreBucketStats => ({
    bucket,
    horizons: (Object.keys(HORIZONS) as LensScoreHorizonKey[]).reduce((acc, horizon) => {
      const values = returns[bucket][horizon];
      const avgReturnPct = average(values);
      acc[horizon] = {
        avgReturnPct: round(avgReturnPct),
        winRatePct: round(values.length ? (values.filter((n) => n > 0).length / values.length) * 100 : null),
        samples: values.length,
      };
      return acc;
    }, {} as Record<LensScoreHorizonKey, BucketHorizonStats>),
  }));

  const tTests = (Object.keys(HORIZONS) as LensScoreHorizonKey[]).reduce((acc, horizon) => {
    acc[horizon] = welchTTest(returns['80-100'][horizon], returns['60-69'][horizon], horizon);
    return acc;
  }, {} as Record<LensScoreHorizonKey, TTestResult>);

  const ready = coverageDays > LENS_SCORE_MIN_HISTORY_DAYS;
  return {
    ready,
    scoreVersion: partition.version,
    requestedScoreVersion,
    rejectedRows: partition.rejected.length,
    unversionedRows: partition.unversionedCount,
    versionMixed: partition.mixed,
    versionRejectedReason: partition.rejectedReason,
    minRequiredDays: LENS_SCORE_MIN_HISTORY_DAYS,
    coverageDays,
    tradingDays: uniqueDates.length,
    minDate,
    maxDate,
    rowsRead: normalized.length,
    roundTripCostPct: LENS_SCORE_ROUND_TRIP_COST_PCT,
    entryRule: `Sinyal close T, entry close H+1 pada ${RETURN_PRICE_BASIS}; bar legacy/unknown price basis ditolak.`,
    buckets,
    tTests,
    note: ready
      ? null
      : `Histori LensRadar baru ${coverageDays} hari kalender; tabel validasi bucket ditampilkan setelah > ${LENS_SCORE_MIN_HISTORY_DAYS} hari.`,
  };
}

export async function runLensScoreBucketBacktest(
  db: Queryable = pool,
  options: { scoreVersion?: string | null } = {}
): Promise<LensScoreBucketBacktestResult> {
  try {
    const { rows } = await db.query(
      `
      SELECT "date", ticker, lens_score, close_price, score_version,
             raw_close_price, adjusted_close_price, price_basis
      FROM lens_radar_history
      WHERE lens_score IS NOT NULL
        AND close_price IS NOT NULL
      ORDER BY ticker ASC, "date" ASC
      `
    );
    return computeLensScoreBucketBacktest(rows, options);
  } catch (error: any) {
    if (error?.code === '42P01') {
      return computeLensScoreBucketBacktest([], options);
    }
    logger.error('LensScore bucket backtest gagal', { error });
    throw error;
  }
}
