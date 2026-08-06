import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { todayDateKeyWIB } from '@/shared/market/trading-session';
import { fetchYahooHistory } from '@/modules/technical';
import {
  LENS_BUCKET_MIN_AVG_VALUE_20D_IDR,
  LENS_BUCKET_ROUND_TRIP_COST_PCT,
  type LensRadarHistoryEntry,
  type LensScoreBucket,
} from './bucket-backtest.service';
import {
  RESEARCH_ONLY_DISCLAIMER,
  resolveValidationStatus,
  type ValidationStatus,
} from '../constants/research-status';
import {
  buildCalibrationTTest,
  calculateCalibrationObservations,
  type CalibrationObservation,
} from './calibration.service';
import {
  drawdownPercentile95Pct,
  LENS_RADAR_HOLDING_DAYS,
  worstTradeDrawdownPct,
} from './history-return-utils';
import { SCORE_VERSION } from '../constants/model-version';
import { PRICE_ADJUSTMENT_VERSION, RETURN_PRICE_BASIS, type PriceBasis } from '@/shared/market/price-basis';

const BUCKETS: LensScoreBucket[] = ['80-100', '70-79', '60-69', '<60'];
export const TRANSPARENCY_CACHE_VERSION = 'liquidity-v1';
// Cache key wajib mengikuti SCORE_VERSION. Jika tidak, Redis bisa menyajikan payload
// lama tanpa metadata versi setelah model versioning di-hardening, sehingga UI publik
// tampak sehat tetapi audit trail versi tidak terbawa.
// `TRANSPARENCY_CACHE_VERSION` dibump setelah one-shot backfill supaya payload lama
// (mis. totalSamples=0 sebelum lens_bucket_stats terisi) tidak bertahan sampai TTL habis.
export const TRANSPARENCY_CACHE_KEY = `sahamlens:cache:lens-radar:transparency:${SCORE_VERSION}:${RETURN_PRICE_BASIS}:${PRICE_ADJUSTMENT_VERSION}:${TRANSPARENCY_CACHE_VERSION}`;

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

interface LensBucketStatsRow {
  run_date: string | Date;
  bucket: string;
  score_version: string | null;
  avg_t1: number | string | null;
  avg_t5: number | string | null;
  avg_t20: number | string | null;
  avg_t20_gross: number | string | null;
  illiquid_rows_skipped: number | string | null;
  unknown_liquidity_rows: number | string | null;
  win_rate_t20: number | string | null;
  total_samples: number | string | null;
  max_dd_p95: number | string | null;
  worst_mae: number | string | null;
  avg_win_t20: number | string | null;
  avg_loss_t20: number | string | null;
  source_rows: number | string | null;
  price_basis?: string | null;
  price_data_version?: string | null;
}

export interface TransparencyBucketRow {
  bucket: LensScoreBucket;
  avgT1: number | null;
  avgT5: number | null;
  avgT20: number | null;
  /** Return T+20 sebelum fee + slippage. `avgT20` adalah angka bersihnya. */
  avgT20Gross: number | null;
  winRateT20: number | null;
  totalSamples: number;
  /** Drawdown intra-trade pada persentil 95: hanya 5% trade yang turun lebih dalam. */
  maxDdP95T20: number | null;
  /** Trade dengan drawdown terdalam. Statistik ekor, ditampilkan sebagai konteks. */
  worstMaeT20: number | null;
  avgWinT20: number | null;
  avgLossT20: number | null;
}

export interface TransparencyEquityPoint {
  date: string;
  lensTop5: number;
  ihsg: number | null;
  dailyReturnTop5: number;
  dailyReturnIHSG: number | null;
  signals: number;
}

export interface TransparencyBanner {
  status: 'collecting' | 'validated' | 'not_significant';
  color: 'yellow' | 'green' | 'slate';
  message: string;
}

export interface TransparencyData {
  asOfDate: string;
  latestStatsRunDate: string | null;
  scoreVersion: string | null;
  requestedScoreVersion: string;
  priceBasis: PriceBasis;
  priceDataVersion: string;
  rejectedRows: number;
  unversionedRows: number;
  versionMixed: boolean;
  versionRejectedReason: string | null;
  startDate: string | null;
  validationDays: number;
  totalSamples: number;
  /** Sinyal yang dibuang gerbang likuiditas ADV20 pada run bucket terakhir. */
  illiquidRowsSkipped: number | null;
  minAvgValue20dIdr: number;
  pValue80VsLt60: number | null;
  significant: boolean;
  disclaimer: string;
  banner: TransparencyBanner;
  buckets: TransparencyBucketRow[];
  equityCurve: TransparencyEquityPoint[];
}

interface IhsgBar {
  date: string;
  open: number;
  close: number;
}

function dateKey(value: string | Date): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  }
  if (typeof value !== 'string') return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function finiteNumber(value: number | string | null): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundPct(value: number | null, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function winRate(values: number[]): number | null {
  if (!values.length) return null;
  return (values.filter((value) => value > 0).length / values.length) * 100;
}

function deriveBucketFallback(observations: CalibrationObservation[], bucket: LensScoreBucket): Partial<TransparencyBucketRow> {
  const t20 = observations
    .filter((obs) => obs.bucket === bucket && typeof obs.returnT20 === 'number')
    .map((obs) => obs.returnT20 as number);
  const t5 = observations
    .filter((obs) => obs.bucket === bucket && typeof obs.returnT5 === 'number')
    .map((obs) => obs.returnT5 as number);
  const avgT20 = average(t20);
  return {
    avgT5: roundPct(average(t5)),
    avgT20: roundPct(avgT20),
    avgT20Gross: roundPct(avgT20 == null ? null : avgT20 + LENS_BUCKET_ROUND_TRIP_COST_PCT),
    winRateT20: roundPct(winRate(t20)),
    // Fallback hanya punya return close-to-close, bukan low harian, jadi angkanya
    // proxy yang lebih optimis daripada MAE di lens_bucket_stats.
    maxDdP95T20: roundPct(drawdownPercentile95Pct(t20)),
    worstMaeT20: roundPct(worstTradeDrawdownPct(t20)),
    avgWinT20: roundPct(average(t20.filter((value) => value > 0))),
    avgLossT20: roundPct(average(t20.filter((value) => value < 0))),
    totalSamples: t20.length,
  };
}

export function buildBucketRows(
  statsRows: LensBucketStatsRow[],
  observations: CalibrationObservation[]
): { latestStatsRunDate: string | null; totalSamples: number; rows: TransparencyBucketRow[] } {
  const statsByBucket = new Map(statsRows.map((row) => [row.bucket, row]));
  const latestStatsRunDate = dateKey(statsRows[0]?.run_date ?? '') ?? null;
  let totalSamples = 0;

  const rows = BUCKETS.map((bucket): TransparencyBucketRow => {
    const stat = statsByBucket.get(bucket);
    const fallback = deriveBucketFallback(observations, bucket);
    const row = {
      bucket,
      avgT1: roundPct(finiteNumber(stat?.avg_t1 ?? null)),
      avgT5: roundPct(finiteNumber(stat?.avg_t5 ?? null) ?? fallback.avgT5 ?? null),
      avgT20: roundPct(finiteNumber(stat?.avg_t20 ?? null) ?? fallback.avgT20 ?? null),
      avgT20Gross: roundPct(finiteNumber(stat?.avg_t20_gross ?? null) ?? fallback.avgT20Gross ?? null),
      winRateT20: roundPct(finiteNumber(stat?.win_rate_t20 ?? null) ?? fallback.winRateT20 ?? null),
      totalSamples: Number(stat?.total_samples ?? fallback.totalSamples ?? 0),
      maxDdP95T20: roundPct(finiteNumber(stat?.max_dd_p95 ?? null) ?? fallback.maxDdP95T20 ?? null),
      worstMaeT20: roundPct(finiteNumber(stat?.worst_mae ?? null) ?? fallback.worstMaeT20 ?? null),
      avgWinT20: roundPct(finiteNumber(stat?.avg_win_t20 ?? null) ?? fallback.avgWinT20 ?? null),
      avgLossT20: roundPct(finiteNumber(stat?.avg_loss_t20 ?? null) ?? fallback.avgLossT20 ?? null),
    };
    totalSamples += row.totalSamples;
    return row;
  });

  return { latestStatsRunDate, totalSamples, rows };
}

async function readLatestBucketStats(db: Queryable = pool, scoreVersion = SCORE_VERSION): Promise<LensBucketStatsRow[]> {
  const { rows } = await db.query(
    `
    WITH latest AS (
      SELECT MAX(run_date) AS run_date
      FROM lens_bucket_stats
      WHERE score_version = $1
        AND price_basis = $2
    )
    SELECT
      s.run_date,
      s.bucket,
      s.score_version,
      s.avg_t1,
      s.avg_t5,
      s.avg_t20,
      s.avg_t20_gross,
      s.illiquid_rows_skipped,
      s.unknown_liquidity_rows,
      s.win_rate_t20,
      s.total_samples,
      s.max_dd_p95,
      s.worst_mae,
      s.avg_win_t20,
      s.avg_loss_t20,
      s.source_rows
      , s.price_basis
      , s.price_data_version
    FROM lens_bucket_stats s
    JOIN latest l ON s.run_date = l.run_date
    WHERE s.score_version = $1
      AND s.price_basis = $2
    ORDER BY CASE s.bucket
      WHEN '80-100' THEN 1
      WHEN '70-79' THEN 2
      WHEN '60-69' THEN 3
      WHEN '<60' THEN 4
      ELSE 5
    END
    `,
    [scoreVersion, RETURN_PRICE_BASIS]
  );
  return rows as LensBucketStatsRow[];
}

async function readLensRadarHistory(db: Queryable = pool): Promise<LensRadarHistoryEntry[]> {
  const { rows } = await db.query(
    `
    SELECT "date", ticker, lens_score, close_price, market_cap, score_version,
           raw_close_price, adjusted_close_price, price_basis, adjustment_factor,
           corporate_action_status, price_data_timestamp, price_data_version,
           avg_value_20d
    FROM lens_radar_history
    WHERE lens_score IS NOT NULL
      AND close_price IS NOT NULL
    ORDER BY ticker ASC, "date" ASC
    `
  );
  return rows as LensRadarHistoryEntry[];
}

async function fetchIhsgBars(): Promise<IhsgBar[]> {
  const history = await fetchYahooHistory('^JKSE', '5y');
  return (history?.history ?? [])
    .map((bar) => ({
      date: bar.Date.split('T')[0],
      open: bar.Open,
      close: bar.Close,
    }))
    .filter((bar) => Number.isFinite(bar.open) && bar.open > 0 && Number.isFinite(bar.close) && bar.close > 0);
}

export function buildTop5EquityCurve(
  observations: CalibrationObservation[],
  ihsgBars: IhsgBar[]
): TransparencyEquityPoint[] {
  const ihsgByDate = new Map(ihsgBars.map((bar) => [bar.date, bar]));
  const byDate = new Map<string, CalibrationObservation[]>();
  for (const obs of observations) {
    if (typeof obs.returnT20 !== 'number') continue;
    const list = byDate.get(obs.signalDate) ?? [];
    list.push(obs);
    byDate.set(obs.signalDate, list);
  }

  let lensEquity = 100;
  let ihsgEquity = 100;
  const points: TransparencyEquityPoint[] = [];

  const signalDates = Array.from(byDate.keys()).sort();
  for (let i = 0; i < signalDates.length; i += LENS_RADAR_HOLDING_DAYS) {
    const date = signalDates[i];
    if (!date) continue;
    const top5 = (byDate.get(date) ?? [])
      .slice()
      .sort((a, b) => b.lensScore - a.lensScore || (b.marketCap ?? 0) - (a.marketCap ?? 0))
      .slice(0, 5);
    const lensReturn = average(top5.map((obs) => obs.returnT20 as number));
    if (lensReturn == null) continue;

    const ihsgReturns = top5
      .map((obs) => {
        if (!obs.exitDateT20) return null;
        const entry = ihsgByDate.get(obs.entryDate);
        const exit = ihsgByDate.get(obs.exitDateT20);
        if (!entry || !exit || entry.open <= 0 || exit.close <= 0) return null;
        return ((exit.close / entry.open) - 1) * 100 - LENS_BUCKET_ROUND_TRIP_COST_PCT;
      })
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const ihsgReturn = average(ihsgReturns);

    lensEquity *= 1 + lensReturn / 100;
    if (ihsgReturn != null) ihsgEquity *= 1 + ihsgReturn / 100;

    points.push({
      date,
      lensTop5: roundPct(lensEquity, 2) ?? lensEquity,
      ihsg: ihsgReturn == null ? null : (roundPct(ihsgEquity, 2) ?? ihsgEquity),
      dailyReturnTop5: roundPct(lensReturn) ?? lensReturn,
      dailyReturnIHSG: roundPct(ihsgReturn),
      signals: top5.length,
    });
  }

  return points;
}

export function buildTransparencyBanner(status: ValidationStatus): TransparencyBanner {
  if (status === 'NOT_ENOUGH_DATA') {
    return {
      status: 'collecting',
      color: 'yellow',
      message: 'Dalam masa pengumpulan data validasi',
    };
  }
  if (status === 'VALIDATED_OUT_OF_SAMPLE') {
    return {
      status: 'validated',
      color: 'green',
      message: 'Validasi out-of-sample lolos; bucket skor tinggi menunjukkan performa lebih baik pada data uji.',
    };
  }
  if (status === 'OUT_OF_SAMPLE_PENDING') {
    return {
      status: 'not_significant',
      color: 'slate',
      message: 'Hasil in-sample indikatif, tetapi validasi out-of-sample masih pending; halaman ini tetap mode riset.',
    };
  }
  if (status === 'FAILED_VALIDATION') {
    return {
      status: 'not_significant',
      color: 'slate',
      message: 'Uji out-of-sample belum mendukung edge LensRadar; gunakan hanya sebagai bahan riset.',
    };
  }
  return {
    status: 'not_significant',
    color: 'slate',
    message: 'Data validasi bersifat eksploratif; belum ada bukti out-of-sample untuk klaim performa.',
  };
}

async function computeTransparencyData(db: Queryable = pool): Promise<TransparencyData> {
  await ensureSharedSchema();
  const requestedScoreVersion = SCORE_VERSION;
  const [statsRows, historyRows] = await Promise.all([
    readLatestBucketStats(db, requestedScoreVersion),
    readLensRadarHistory(db),
  ]);
  const {
    observations,
    scoreVersion,
    rejectedRows,
    unversionedRows,
    versionMixed,
    versionRejectedReason,
  } = await calculateCalibrationObservations(historyRows, undefined, { scoreVersion: requestedScoreVersion });
  const ihsgBars = await fetchIhsgBars();

  const dates = Array.from(new Set(historyRows.map((row) => dateKey(row.date)).filter((date): date is string => !!date))).sort();
  const tTest = buildCalibrationTTest(observations);
  const bucketResult = buildBucketRows(statsRows, observations);
  const validationDays = dates.length;
  const startDate = dates[0] ?? null;
  const pValue = tTest.pValue;
  const validationStatus = resolveValidationStatus({
    validationDays,
    effectiveSamples: tTest.highBucketSamples + tTest.lowBucketSamples,
    pValue,
    outOfSampleTested: false,
  });

  return {
    asOfDate: todayDateKeyWIB(),
    latestStatsRunDate: bucketResult.latestStatsRunDate,
    scoreVersion,
    requestedScoreVersion,
    priceBasis: RETURN_PRICE_BASIS,
    priceDataVersion: PRICE_ADJUSTMENT_VERSION,
    rejectedRows,
    unversionedRows,
    versionMixed,
    versionRejectedReason,
    startDate,
    validationDays,
    totalSamples: bucketResult.totalSamples,
    illiquidRowsSkipped: finiteNumber(statsRows[0]?.illiquid_rows_skipped ?? null),
    minAvgValue20dIdr: LENS_BUCKET_MIN_AVG_VALUE_20D_IDR,
    pValue80VsLt60: pValue,
    significant: tTest.significant,
    disclaimer: `Data point-in-time, entry Open H+1, exit T+N berbasis hari bursa, hanya sinyal dengan nilai transaksi rata-rata 20 hari di atas Rp ${LENS_BUCKET_MIN_AVG_VALUE_20D_IDR / 1_000_000_000} miliar/hari pada tanggal sinyal, window equity curve Top 5 tidak tumpang tindih 20 hari, setelah fee 0.4% + slippage 0.1%, data sejak ${startDate ?? '-'}. ${RESEARCH_ONLY_DISCLAIMER}`,
    banner: buildTransparencyBanner(validationStatus),
    buckets: bucketResult.rows,
    equityCurve: buildTop5EquityCurve(observations, ihsgBars),
  };
}

export async function getTransparencyData(): Promise<TransparencyData> {
  return getOrCompute(TRANSPARENCY_CACHE_KEY, CACHE_TTL_SEC.LENS_TRANSPARENCY, () => computeTransparencyData());
}
