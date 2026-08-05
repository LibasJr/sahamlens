import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { todayDateKeyWIB } from '@/shared/market/trading-session';
import { fetchYahooHistory } from '@/modules/technical';
import {
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
import { LENS_RADAR_HOLDING_DAYS } from './history-return-utils';

const BUCKETS: LensScoreBucket[] = ['80-100', '70-79', '60-69', '<60'];
const TRANSPARENCY_CACHE_KEY = 'sahamlens:cache:lens-radar:transparency:v1';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

interface LensBucketStatsRow {
  run_date: string | Date;
  bucket: string;
  avg_t1: number | string | null;
  avg_t5: number | string | null;
  avg_t20: number | string | null;
  win_rate_t20: number | string | null;
  total_samples: number | string | null;
  max_drawdown_t20: number | string | null;
  avg_win_t20: number | string | null;
  avg_loss_t20: number | string | null;
  source_rows: number | string | null;
}

export interface TransparencyBucketRow {
  bucket: LensScoreBucket;
  avgT1: number | null;
  avgT5: number | null;
  avgT20: number | null;
  winRateT20: number | null;
  totalSamples: number;
  maxDrawdownT20: number | null;
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
  startDate: string | null;
  validationDays: number;
  totalSamples: number;
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

function maxDrawdownPct(values: { date: string; returnPct: number }[]): number | null {
  if (!values.length) return null;
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const item of [...values].sort((a, b) => a.date.localeCompare(b.date))) {
    equity *= 1 + item.returnPct / 100;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, ((equity / peak) - 1) * 100);
  }
  return maxDrawdown;
}

function deriveBucketFallback(observations: CalibrationObservation[], bucket: LensScoreBucket): Partial<TransparencyBucketRow> {
  const t20 = observations
    .filter((obs) => obs.bucket === bucket && typeof obs.returnT20 === 'number')
    .map((obs) => obs.returnT20 as number);
  const t5 = observations
    .filter((obs) => obs.bucket === bucket && typeof obs.returnT5 === 'number')
    .map((obs) => obs.returnT5 as number);
  const datedT20 = observations
    .filter((obs) => obs.bucket === bucket && typeof obs.returnT20 === 'number')
    .map((obs) => ({ date: obs.signalDate, returnPct: obs.returnT20 as number }));
  return {
    avgT5: roundPct(average(t5)),
    avgT20: roundPct(average(t20)),
    winRateT20: roundPct(winRate(t20)),
    maxDrawdownT20: roundPct(maxDrawdownPct(datedT20)),
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
      winRateT20: roundPct(finiteNumber(stat?.win_rate_t20 ?? null) ?? fallback.winRateT20 ?? null),
      totalSamples: Number(stat?.total_samples ?? fallback.totalSamples ?? 0),
      maxDrawdownT20: roundPct(finiteNumber(stat?.max_drawdown_t20 ?? null) ?? fallback.maxDrawdownT20 ?? null),
      avgWinT20: roundPct(finiteNumber(stat?.avg_win_t20 ?? null) ?? fallback.avgWinT20 ?? null),
      avgLossT20: roundPct(finiteNumber(stat?.avg_loss_t20 ?? null) ?? fallback.avgLossT20 ?? null),
    };
    totalSamples += row.totalSamples;
    return row;
  });

  return { latestStatsRunDate, totalSamples, rows };
}

async function readLatestBucketStats(db: Queryable = pool): Promise<LensBucketStatsRow[]> {
  const { rows } = await db.query(
    `
    WITH latest AS (
      SELECT MAX(run_date) AS run_date
      FROM lens_bucket_stats
    )
    SELECT
      s.run_date,
      s.bucket,
      s.avg_t1,
      s.avg_t5,
      s.avg_t20,
      s.win_rate_t20,
      s.total_samples,
      s.max_drawdown_t20,
      s.avg_win_t20,
      s.avg_loss_t20,
      s.source_rows
    FROM lens_bucket_stats s
    JOIN latest l ON s.run_date = l.run_date
    ORDER BY CASE s.bucket
      WHEN '80-100' THEN 1
      WHEN '70-79' THEN 2
      WHEN '60-69' THEN 3
      WHEN '<60' THEN 4
      ELSE 5
    END
    `
  );
  return rows as LensBucketStatsRow[];
}

async function readLensRadarHistory(db: Queryable = pool): Promise<LensRadarHistoryEntry[]> {
  const { rows } = await db.query(
    `
    SELECT "date", ticker, lens_score, close_price, market_cap, score_version
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
  const [statsRows, historyRows] = await Promise.all([
    readLatestBucketStats(db),
    readLensRadarHistory(db),
  ]);
  const { observations } = await calculateCalibrationObservations(historyRows);
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
    startDate,
    validationDays,
    totalSamples: bucketResult.totalSamples,
    pValue80VsLt60: pValue,
    significant: tTest.significant,
    disclaimer: `Data point-in-time, entry Open H+1, exit T+N berbasis hari bursa, window equity curve Top 5 tidak tumpang tindih 20 hari, setelah fee 0.4% + slippage 0.1%, data sejak ${startDate ?? '-'}. ${RESEARCH_ONLY_DISCLAIMER}`,
    banner: buildTransparencyBanner(validationStatus),
    buckets: bucketResult.rows,
    equityCurve: buildTop5EquityCurve(observations, ihsgBars),
  };
}

export async function getTransparencyData(): Promise<TransparencyData> {
  return getOrCompute(TRANSPARENCY_CACHE_KEY, CACHE_TTL_SEC.LENS_TRANSPARENCY, () => computeTransparencyData());
}
