import { pool } from '../../../shared/database/postgres.client';
import { logger } from '../../../shared/logger/logger';
import {
  DATA_SNAPSHOT_VERSION,
  SCORE_VERSION,
  partitionByScoreVersion,
} from '../../lens-radar/constants/model-version';
import { LENS_SCORE_MODEL_METADATA } from '../../technical/config/lens-score-model';
import { RETURN_PRICE_BASIS, type PriceBasis } from '../../../shared/market/price-basis';
import {
  countValidationPopulationRejection,
  emptyValidationPopulationCounters,
  rejectFromValidationPopulation,
} from '../../lens-radar/service/validation-population';
import { researchOutputProvenance, type ResearchOutputProvenance } from '../../../shared/research/provenance';

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
  score_config_hash?: string | null;
  universe_version?: string | null;
  adjusted_close_price?: number | string | null;
  raw_close_price?: number | string | null;
  price_basis?: PriceBasis | string | null;
  coverage_pct?: number | string | null;
  eligibility_status?: string | null;
  universe_eligible?: boolean | string | number | null;
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
  scoreConfigHash: string;
  configRejectedRows: number;
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
  provenance: ResearchOutputProvenance & { universeMixed: boolean };
  note: string | null;
}

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

interface LensBucketStatsSnapshotRow {
  run_date: string | Date;
  bucket: LensScoreBucketKey;
  score_version: string | null;
  score_config_hash: string | null;
  avg_t1: number | string | null;
  avg_t5: number | string | null;
  avg_t20: number | string | null;
  win_rate_t5: number | string | null;
  win_rate_t20: number | string | null;
  total_samples: number | string | null;
  source_rows: number | string | null;
  unique_tickers: number | string | null;
  round_trip_cost_pct: number | string | null;
  price_basis: PriceBasis | string | null;
  price_data_version: string | null;
}

interface LensRadarCoverageRow {
  min_date: string | Date | null;
  max_date: string | Date | null;
  trading_days: number | string | null;
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

function toNonNegativeInteger(value: number | string | null | undefined): number {
  const n = toFiniteNumber(value);
  return n == null ? 0 : Math.max(0, Math.trunc(n));
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

function buildSnapshotTTest(
  high: BucketHorizonStats,
  baseline: BucketHorizonStats,
  horizon: LensScoreHorizonKey,
): TTestResult {
  const meanDiffPct = high.avgReturnPct != null && baseline.avgReturnPct != null
    ? round(high.avgReturnPct - baseline.avgReturnPct)
    : null;
  return {
    horizon,
    comparison: '80-100_vs_60-69',
    meanDiffPct,
    tStatistic: null,
    degreesOfFreedom: null,
    pValueApprox: null,
    significantAt5Pct: false,
    bucket80Better: meanDiffPct == null ? null : meanDiffPct > 0,
    samples80: high.samples,
    samples60: baseline.samples,
    note: 'Snapshot publik memakai agregat lens_bucket_stats; distribusi return mentah tidak disimpan sehingga Welch t-test tidak dihitung ulang di request publik.',
  };
}

function buildBucketBacktestFromSnapshot(
  statsRows: LensBucketStatsSnapshotRow[],
  coverage: LensRadarCoverageRow | null,
  options: { scoreVersion?: string | null; scoreConfigHash?: string | null; calculatedAt?: string } = {},
): LensScoreBucketBacktestResult {
  const requestedScoreVersion = options.scoreVersion?.trim() || SCORE_VERSION;
  const requestedConfigHash = options.scoreConfigHash?.trim() || LENS_SCORE_MODEL_METADATA.configHash;
  const byBucket = new Map(statsRows.map((row) => [row.bucket, row]));
  const first = statsRows[0];
  const minDate = toDateKey(coverage?.min_date ?? '') ?? null;
  const maxDate = toDateKey(coverage?.max_date ?? first?.run_date ?? '') ?? null;
  const coverageDays = minDate && maxDate
    ? Math.round((Date.parse(`${maxDate}T00:00:00Z`) - Date.parse(`${minDate}T00:00:00Z`)) / 86_400_000) + 1
    : 0;
  const tradingDays = toNonNegativeInteger(coverage?.trading_days ?? null);
  const totalRowsRead = statsRows.reduce((sum, row) => sum + toNonNegativeInteger(row.total_samples), 0);
  const roundTripCostPct = toFiniteNumber(first?.round_trip_cost_pct ?? null) ?? LENS_SCORE_ROUND_TRIP_COST_PCT;
  const scoreVersion = first?.score_version ?? requestedScoreVersion;
  const scoreConfigHash = first?.score_config_hash ?? requestedConfigHash;

  const buckets = BUCKET_ORDER.map((bucket): LensScoreBucketStats => {
    const row = byBucket.get(bucket);
    const samples = toNonNegativeInteger(row?.total_samples ?? null);
    return {
      bucket,
      horizons: {
        t1: {
          avgReturnPct: round(toFiniteNumber(row?.avg_t1 ?? null)),
          winRatePct: null,
          samples,
        },
        t5: {
          avgReturnPct: round(toFiniteNumber(row?.avg_t5 ?? null)),
          winRatePct: round(toFiniteNumber(row?.win_rate_t5 ?? null)),
          samples,
        },
        t20: {
          avgReturnPct: round(toFiniteNumber(row?.avg_t20 ?? null)),
          winRatePct: round(toFiniteNumber(row?.win_rate_t20 ?? null)),
          samples,
        },
      },
    };
  });
  const high = buckets.find((bucket) => bucket.bucket === '80-100')!;
  const baseline = buckets.find((bucket) => bucket.bucket === '60-69')!;
  const tTests = (Object.keys(HORIZONS) as LensScoreHorizonKey[]).reduce((acc, horizon) => {
    acc[horizon] = buildSnapshotTTest(high.horizons[horizon], baseline.horizons[horizon], horizon);
    return acc;
  }, {} as Record<LensScoreHorizonKey, TTestResult>);
  const ready = totalRowsRead > 0;
  const entryRule = `Sinyal close T, entry open H+1 pada ${RETURN_PRICE_BASIS}; snapshot berasal dari lens_bucket_stats hasil cron LensRadar.`;

  return {
    ready,
    scoreVersion,
    requestedScoreVersion,
    scoreConfigHash,
    configRejectedRows: 0,
    rejectedRows: 0,
    unversionedRows: 0,
    versionMixed: false,
    versionRejectedReason: null,
    minRequiredDays: LENS_SCORE_MIN_HISTORY_DAYS,
    coverageDays,
    tradingDays,
    minDate,
    maxDate,
    rowsRead: totalRowsRead,
    roundTripCostPct,
    entryRule,
    buckets,
    tTests,
    provenance: {
      ...researchOutputProvenance({
        source: 'lens_bucket_stats',
        period: minDate && maxDate ? `${minDate} sampai ${maxDate}` : 'Belum ada periode valid',
        dataMode: 'POINT_IN_TIME',
        asOf: maxDate ?? undefined,
        retrievedAt: options.calculatedAt ?? new Date().toISOString(),
        confidence: ready ? 'calculated' : 'unknown',
        isEstimated: false,
        modelVersion: scoreVersion,
        universeVersion: null,
        dataSnapshotVersion: DATA_SNAPSHOT_VERSION,
        transformation: `Bucket LensScore; sinyal close T, entry open H+1; return memakai ${RETURN_PRICE_BASIS} setelah biaya round-trip.`,
        note: 'Endpoint publik membaca snapshot agregat cron agar tidak menghitung ulang jalur legacy close-to-close pada request user.',
      }),
      universeMixed: false,
    },
    note: ready
      ? null
      : `Belum ada snapshot lens_bucket_stats untuk ${requestedScoreVersion}; tabel validasi bucket akan tampil setelah cron menghasilkan sampel valid.`,
  };
}

export function computeLensScoreBucketBacktest(
  rows: LensRadarHistoryRow[],
  options: { scoreVersion?: string | null; scoreConfigHash?: string | null; calculatedAt?: string } = {}
): LensScoreBucketBacktestResult {
  const requestedScoreVersion = options.scoreVersion?.trim() || SCORE_VERSION;
  const requestedConfigHash = options.scoreConfigHash?.trim() || LENS_SCORE_MODEL_METADATA.configHash;
  const partition = partitionByScoreVersion(
    Array.isArray(rows) ? rows : [],
    requestedScoreVersion,
    requestedConfigHash,
  );
  // Gerbang populasi yang SAMA dengan produksi, bucket backtest, dan calibration lab
  // (temuan H-01). Endpoint ini publik, jadi tanpa gerbang ini ia menerbitkan angka
  // bucket dari sinyal yang aplikasinya sendiri tidak akan pernah rekomendasikan.
  const productionGate = emptyValidationPopulationCounters();
  const normalized = partition.accepted
    .map((row) => {
      const date = toDateKey(row.date);
      const score = toFiniteNumber(row.lens_score);
      const close = toFiniteNumber(row.adjusted_close_price);
      const ticker = typeof row.ticker === 'string' ? row.ticker.trim().toUpperCase() : '';
      if (!date || !ticker || row.price_basis !== RETURN_PRICE_BASIS || score == null || close == null || close <= 0) return null;
      if (countValidationPopulationRejection(productionGate, rejectFromValidationPopulation(row))) return null;
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
  const universeVersions = Array.from(new Set(
    partition.accepted
      .map((row) => typeof row.universe_version === 'string' ? row.universe_version.trim() : '')
      .filter(Boolean),
  ));
  const universeMixed = universeVersions.length > 1;
  return {
    ready,
    scoreVersion: partition.version,
    requestedScoreVersion,
    scoreConfigHash: partition.configHash ?? requestedConfigHash,
    configRejectedRows: partition.configRejectedCount,
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
    provenance: {
      ...researchOutputProvenance({
        source: 'lens_radar_history',
        period: minDate && maxDate ? `${minDate} sampai ${maxDate}` : 'Belum ada periode valid',
        dataMode: 'POINT_IN_TIME',
        asOf: maxDate ?? undefined,
        retrievedAt: options.calculatedAt ?? new Date().toISOString(),
        confidence: 'calculated',
        isEstimated: false,
        modelVersion: partition.version,
        universeVersion: universeMixed ? null : (universeVersions[0] ?? null),
        dataSnapshotVersion: DATA_SNAPSHOT_VERSION,
        transformation: `Bucket LensScore; sinyal close T, entry close H+1; return memakai ${RETURN_PRICE_BASIS} setelah biaya round-trip.`,
        note: 'Welch t-test memakai normal approximation dan merupakan bukti riset indikatif, bukan validasi final.',
      }),
      universeMixed,
    },
    note: ready
      ? null
      : `Histori LensRadar baru ${coverageDays} hari kalender; tabel validasi bucket ditampilkan setelah > ${LENS_SCORE_MIN_HISTORY_DAYS} hari.`,
  };
}

export async function runLensScoreBucketBacktest(
  db: Queryable = pool,
  options: { scoreVersion?: string | null; scoreConfigHash?: string | null; calculatedAt?: string } = {}
): Promise<LensScoreBucketBacktestResult> {
  const scoreVersion = options.scoreVersion?.trim() || SCORE_VERSION;
  const scoreConfigHash = options.scoreConfigHash?.trim() || LENS_SCORE_MODEL_METADATA.configHash;
  try {
    const [{ rows: statsRows }, { rows: coverageRows }] = await Promise.all([
      db.query(
        `
        WITH latest AS (
          SELECT MAX(run_date) AS run_date
          FROM lens_bucket_stats
          WHERE score_version = $1
            AND score_config_hash = $2
            AND price_basis = $3
        )
        SELECT
          s.run_date,
          s.bucket,
          s.score_version,
          s.score_config_hash,
          s.avg_t1,
          s.avg_t5,
          s.avg_t20,
          s.win_rate_t5,
          s.win_rate_t20,
          s.total_samples,
          s.source_rows,
          s.unique_tickers,
          s.round_trip_cost_pct,
          s.price_basis,
          s.price_data_version
        FROM lens_bucket_stats s
        JOIN latest l ON s.run_date = l.run_date
        WHERE s.score_version = $1
          AND s.score_config_hash = $2
          AND s.price_basis = $3
        ORDER BY CASE s.bucket
          WHEN '80-100' THEN 1
          WHEN '70-79' THEN 2
          WHEN '60-69' THEN 3
          WHEN '<60' THEN 4
          ELSE 5
        END
        `,
        [scoreVersion, scoreConfigHash, RETURN_PRICE_BASIS],
      ),
      db.query(
        `
        SELECT MIN("date") AS min_date, MAX("date") AS max_date, COUNT(DISTINCT "date") AS trading_days
        FROM lens_radar_history
        WHERE lens_score IS NOT NULL
          AND close_price IS NOT NULL
          AND score_version = $1
          AND score_config_hash = $2
        `,
        [scoreVersion, scoreConfigHash],
      ),
    ]);
    return buildBucketBacktestFromSnapshot(
      statsRows as LensBucketStatsSnapshotRow[],
      (coverageRows[0] as LensRadarCoverageRow | undefined) ?? null,
      options,
    );
  } catch (error: any) {
    if (error?.code === '42P01') {
      return buildBucketBacktestFromSnapshot([], null, options);
    }
    logger.error('LensScore bucket backtest gagal', { err: error });
    throw error;
  }
}
