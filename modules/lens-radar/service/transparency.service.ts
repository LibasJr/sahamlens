import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { todayDateKeyWIB } from '@/shared/market/trading-session';
import { fetchYahooHistoryDirect } from '@/modules/technical';
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
import { LENS_SCORE_MODEL_METADATA } from '@/modules/technical/config/lens-score-model';
import {
  VALIDATION_LIMITATIONS,
  VALIDATION_LIMITATIONS_REVIEWED_ON,
} from '../constants/validation-limitations';
import { PRICE_ADJUSTMENT_VERSION, RETURN_PRICE_BASIS, type PriceBasis } from '@/shared/market/price-basis';
import { provenancedValue, type ProvenancedFinancialValue } from '@/shared/finance/provenance';

const BUCKETS: LensScoreBucket[] = ['80-100', '70-79', '60-69', '<60'];
// v2: payload sekarang membedakan observasi mentah, sampel efektif per bucket edge,
// dan hari sinyal yang benar-benar lolos populasi validasi. Cache lama tidak boleh
// membuat UI terus menampilkan penyebut yang sudah tidak tepat.
export const TRANSPARENCY_CACHE_VERSION = 'audit-v3-pit-universe';
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
  score_config_hash?: string | null;
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
  provenance: {
    avgT20: ProvenancedFinancialValue;
    winRateT20: ProvenancedFinancialValue;
  };
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
  scoreConfigHash: string;
  configRejectedRows: number;
  priceBasis: PriceBasis;
  priceDataVersion: string;
  rejectedRows: number;
  unversionedRows: number;
  versionMixed: boolean;
  versionRejectedReason: string | null;
  startDate: string | null;
  /** Tanggal sinyal unik yang lolos gerbang populasi, bukan seluruh baris arsip. */
  validationDays: number;
  totalSamples: number;
  /** Sampel T+20 yang sudah didekorelasi untuk uji bucket edge. */
  effectiveHighBucketSamples: number;
  effectiveLowBucketSamples: number;
  /** Sinyal yang dibuang gerbang likuiditas ADV20 pada run bucket terakhir. */
  illiquidRowsSkipped: number | null;
  minAvgValue20dIdr: number;
  pValue80VsLt60: number | null;
  significant: boolean;
  disclaimer: string;
  /** Bias yang melekat pada angka di halaman ini (temuan H-02). Halaman ini PUBLIK dan
   * dibaca sebagai bukti kualitas model, jadi biasnya harus ikut terbaca - sebelumnya
   * hanya halaman Backtest yang menyatakannya. */
  limitations: readonly string[];
  limitationsReviewedOn: string;
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
    const avgT20 = roundPct(finiteNumber(stat?.avg_t20 ?? null) ?? fallback.avgT20 ?? null);
    const winRateT20 = roundPct(finiteNumber(stat?.win_rate_t20 ?? null) ?? fallback.winRateT20 ?? null);
    const provenanceBase = {
      source: stat ? 'lens_bucket_stats' : 'calibration-observation-fallback',
      period: latestStatsRunDate ?? 'on-demand',
      asOf: latestStatsRunDate ?? undefined,
      retrievedAt: latestStatsRunDate ?? undefined,
      confidence: stat ? 'calculated' as const : 'fallback' as const,
      isEstimated: false,
      note: stat ? 'Dihitung dari tabel agregat bucket PIT.' : 'Fallback dihitung dari observasi kalibrasi saat agregat belum tersedia.',
    };
    const row = {
      bucket,
      avgT1: roundPct(finiteNumber(stat?.avg_t1 ?? null)),
      avgT5: roundPct(finiteNumber(stat?.avg_t5 ?? null) ?? fallback.avgT5 ?? null),
      avgT20,
      avgT20Gross: roundPct(finiteNumber(stat?.avg_t20_gross ?? null) ?? fallback.avgT20Gross ?? null),
      winRateT20,
      provenance: {
        avgT20: provenancedValue(avgT20, provenanceBase),
        winRateT20: provenancedValue(winRateT20, provenanceBase),
      },
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

async function readLatestBucketStats(
  db: Queryable = pool,
  scoreVersion = SCORE_VERSION,
  scoreConfigHash = LENS_SCORE_MODEL_METADATA.configHash,
): Promise<LensBucketStatsRow[]> {
  const { rows } = await db.query(
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
    [scoreVersion, scoreConfigHash, RETURN_PRICE_BASIS]
  );
  return rows as LensBucketStatsRow[];
}

async function readLensRadarHistory(db: Queryable = pool): Promise<LensRadarHistoryEntry[]> {
  const { rows } = await db.query(
    `
    SELECT "date", ticker, lens_score, close_price, market_cap, score_version, score_config_hash, universe_version,
           raw_close_price, adjusted_close_price, price_basis, adjustment_factor,
           corporate_action_status, price_data_timestamp, price_data_version,
           avg_value_20d, coverage_pct, eligibility_status, fundamental_available_max, universe_eligible
    FROM lens_radar_history
    WHERE lens_score IS NOT NULL
      AND close_price IS NOT NULL
    ORDER BY ticker ASC, "date" ASC
    `
  );
  return rows as LensRadarHistoryEntry[];
}

async function fetchIhsgBars(): Promise<IhsgBar[]> {
  const history = await fetchYahooHistoryDirect('^JKSE', '5y');
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
  // Jangan lompat berdasarkan *jumlah tanggal sinyal*. Arsip dapat bolong pada hari
  // tertentu; `i += 20` lalu dapat memilih sinyal baru ketika posisi sebelumnya masih
  // berjalan. Sinyal berikutnya baru boleh dipakai setelah exit terjauh dari Top 5
  // sebelumnya (signal pada hari exit sah karena entry-nya baru Open H+1).
  let earliestNextSignalDate: string | null = null;
  for (const date of signalDates) {
    if (!date || (earliestNextSignalDate != null && date < earliestNextSignalDate)) continue;
    const top5 = (byDate.get(date) ?? [])
      .slice()
      .sort((a, b) => b.lensScore - a.lensScore || (b.marketCap ?? 0) - (a.marketCap ?? 0))
      .slice(0, 5);
    const lensReturn = average(top5.map((obs) => obs.returnT20 as number));
    if (lensReturn == null) continue;

    const latestExitDate = top5
      .map((obs) => obs.exitDateT20)
      .filter((exitDate): exitDate is string => typeof exitDate === 'string')
      .sort()
      .at(-1);
    // Observation dengan return T+20 harusnya selalu punya tanggal exit. Tetap
    // fail-closed supaya curve tidak mengklaim window non-tumpang tindih bila data
    // kontradiktif sampai di sini.
    if (!latestExitDate) continue;

    const ihsgReturns = top5
      .map((obs) => {
        if (!obs.exitDateT20) return null;
        const entry = ihsgByDate.get(obs.entryDate);
        const exit = ihsgByDate.get(obs.exitDateT20);
        if (!entry || !exit || entry.open <= 0 || exit.close <= 0) return null;
        return ((exit.close / entry.open) - 1) * 100;
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
    earliestNextSignalDate = latestExitDate;
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
  const requestedConfigHash = LENS_SCORE_MODEL_METADATA.configHash;
  const [statsRows, historyRows] = await Promise.all([
    readLatestBucketStats(db, requestedScoreVersion, requestedConfigHash),
    readLensRadarHistory(db),
  ]);
  const {
    observations,
    scoreVersion,
    rejectedRows,
    unversionedRows,
    versionMixed,
    versionRejectedReason,
    scoreConfigHash,
    configRejectedRows,
  } = await calculateCalibrationObservations(historyRows, undefined, {
    scoreVersion: requestedScoreVersion,
    scoreConfigHash: requestedConfigHash,
  });
  const ihsgBars = await fetchIhsgBars();

  // Hari validasi harus mengikuti sinyal yang benar-benar lolos versi model, basis
  // harga, likuiditas, cakupan, dan eligibility. Menghitung seluruh histori di sini
  // membuat arsip legacy/rejected membesarkan umur validasi di layar.
  const dates = Array.from(new Set(observations.map((observation) => observation.signalDate))).sort();
  const tTest = buildCalibrationTTest(observations);
  const bucketResult = buildBucketRows(statsRows, observations);
  const validationDays = dates.length;
  const startDate = dates[0] ?? null;
  const pValue = tTest.pValue;
  const validationStatus = resolveValidationStatus({
    validationDays,
    // t-test memakai minimal 30 sampel PADA MASING-MASING bucket edge. Nilai minimum
    // dipakai agar satu bucket besar tidak membuat status terlihat siap saat sisi
    // pembandingnya belum cukup data.
    effectiveSamples: Math.min(tTest.highBucketSamples, tTest.lowBucketSamples),
    pValue,
    outOfSampleTested: false,
  });

  return {
    asOfDate: todayDateKeyWIB(),
    latestStatsRunDate: bucketResult.latestStatsRunDate,
    scoreVersion,
    requestedScoreVersion,
    scoreConfigHash,
    configRejectedRows,
    priceBasis: RETURN_PRICE_BASIS,
    priceDataVersion: PRICE_ADJUSTMENT_VERSION,
    rejectedRows,
    unversionedRows,
    versionMixed,
    versionRejectedReason,
    startDate,
    validationDays,
    totalSamples: bucketResult.totalSamples,
    effectiveHighBucketSamples: tTest.highBucketSamples,
    effectiveLowBucketSamples: tTest.lowBucketSamples,
    illiquidRowsSkipped: finiteNumber(statsRows[0]?.illiquid_rows_skipped ?? null),
    minAvgValue20dIdr: LENS_BUCKET_MIN_AVG_VALUE_20D_IDR,
    pValue80VsLt60: pValue,
    significant: tTest.significant,
    disclaimer: `Data point-in-time, entry Open H+1, exit T+N berbasis hari bursa, hanya sinyal dengan nilai transaksi rata-rata 20 hari di atas Rp ${LENS_BUCKET_MIN_AVG_VALUE_20D_IDR / 1_000_000_000} miliar/hari pada tanggal sinyal, window equity curve Top 5 berikutnya baru dimulai setelah exit window sebelumnya, setelah fee 0.4% + slippage 0.1%, data sejak ${startDate ?? '-'}. ${RESEARCH_ONLY_DISCLAIMER}`,
    limitations: VALIDATION_LIMITATIONS,
    limitationsReviewedOn: VALIDATION_LIMITATIONS_REVIEWED_ON,
    banner: buildTransparencyBanner(validationStatus),
    buckets: bucketResult.rows,
    equityCurve: buildTop5EquityCurve(observations, ihsgBars),
  };
}

export interface PublicTransparencyData {
  asOfDate: string;
  modelStatus: 'RESEARCH_ONLY' | 'MODEL_UNVALIDATED' | 'NON_ACTIONABLE' | 'VALIDATED_OUT_OF_SAMPLE';
  model: {
    scoreVersion: string;
    scoreConfigHash: string;
    priceBasis: PriceBasis;
    priceDataVersion: string;
  };
  validation: {
    status: TransparencyBanner['status'];
    message: string;
    metricProvenance: {
      highBucketAvgT20: ProvenancedFinancialValue;
      highBucketWinRateT20: ProvenancedFinancialValue;
    };
    startDate: string | null;
    validationDays: number;
    totalSamples: number;
    effectiveHighBucketSamples: number;
    effectiveLowBucketSamples: number;
    pValue80VsLt60: number | null;
    significant: boolean;
    outOfSampleStatus: 'PENDING';
    returnBasis: string;
  };
  dataQuality: {
    latestStatsRunDate: string | null;
    illiquidRowsSkipped: number | null;
    rejectedRows: number;
    unversionedRows: number;
    versionMixed: boolean;
    versionRejectedReason: string | null;
    minAvgValue20dIdr: number;
  };
  methodology: readonly string[];
  limitations: readonly string[];
  limitationsReviewedOn: string;
  disclaimer: string;
}

export async function getTransparencyData(): Promise<TransparencyData> {
  return getOrCompute(TRANSPARENCY_CACHE_KEY, CACHE_TTL_SEC.LENS_TRANSPARENCY, () => computeTransparencyData());
}

export function toPublicTransparencyData(data: TransparencyData): PublicTransparencyData {
  return {
    asOfDate: data.asOfDate,
    modelStatus: data.banner.status === 'validated' ? 'VALIDATED_OUT_OF_SAMPLE' : 'RESEARCH_ONLY',
    model: {
      scoreVersion: data.scoreVersion ?? data.requestedScoreVersion,
      scoreConfigHash: data.scoreConfigHash,
      priceBasis: data.priceBasis,
      priceDataVersion: data.priceDataVersion,
    },
    validation: {
      status: data.banner.status,
      message: data.banner.message,
      metricProvenance: {
        highBucketAvgT20: data.buckets.find((bucket) => bucket.bucket === '80-100')?.provenance.avgT20
          ?? provenancedValue(null, { source: 'lens_bucket_stats', confidence: 'unknown', isEstimated: false, note: 'Bucket 80-100 belum tersedia.' }),
        highBucketWinRateT20: data.buckets.find((bucket) => bucket.bucket === '80-100')?.provenance.winRateT20
          ?? provenancedValue(null, { source: 'lens_bucket_stats', confidence: 'unknown', isEstimated: false, note: 'Bucket 80-100 belum tersedia.' }),
      },
      startDate: data.startDate,
      validationDays: data.validationDays,
      totalSamples: data.totalSamples,
      effectiveHighBucketSamples: data.effectiveHighBucketSamples,
      effectiveLowBucketSamples: data.effectiveLowBucketSamples,
      pValue80VsLt60: data.pValue80VsLt60,
      significant: data.significant,
      outOfSampleStatus: 'PENDING',
      returnBasis: 'Entry Open H+1, exit T+N hari bursa, return T+20 bersih setelah fee 0,4% + slippage 0,1%',
    },
    dataQuality: {
      latestStatsRunDate: data.latestStatsRunDate,
      illiquidRowsSkipped: data.illiquidRowsSkipped,
      rejectedRows: data.rejectedRows,
      unversionedRows: data.unversionedRows,
      versionMixed: data.versionMixed,
      versionRejectedReason: data.versionRejectedReason,
      minAvgValue20dIdr: data.minAvgValue20dIdr,
    },
    methodology: [
      'LensScore dibekukan per versi model dan hash konfigurasi sebelum hasil forward dihitung.',
      'Validasi memakai data point-in-time: hanya sinyal yang lolos versi model, basis harga, likuiditas, cakupan, dan eligibility.',
      'Bucket skor tinggi dibandingkan dengan bucket skor rendah memakai sampel T+20 yang didekorelasi.',
      'Status publik tidak naik dari research-only sebelum syarat sampel dan out-of-sample terpenuhi.',
    ],
    limitations: data.limitations,
    limitationsReviewedOn: data.limitationsReviewedOn,
    disclaimer: data.disclaimer,
  };
}

export async function getPublicTransparencyData(): Promise<PublicTransparencyData> {
  return toPublicTransparencyData(await getTransparencyData());
}
