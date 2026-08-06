import { generateAI, hasAnyAIProvider } from '@/lib/aiProviders';
import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { todayDateKeyWIB } from '@/shared/market/trading-session';
import { fetchYahooHistory } from '@/modules/technical';
import {
  LENS_BUCKET_MIN_AVG_VALUE_20D_IDR,
  LENS_BUCKET_ROUND_TRIP_COST_PCT,
  type DailyOpenBar,
  type DailyOpenProvider,
  type LensScoreBucket,
  type LensRadarHistoryEntry,
} from './bucket-backtest.service';
import {
  barAtTradingOffset,
  buildTradingCalendar,
  decorrelateByTicker,
  hasCorporateActionGap,
  LENS_RADAR_HOLDING_DAYS,
} from './history-return-utils';
import {
  PRODUCT_VALIDATION_STATUS,
  THRESHOLD_RECOMMENDER_ENABLED,
  suppressUnvalidatedSignificance,
} from '../constants/research-status';
import { SCORE_VERSION, partitionByScoreVersion } from '../constants/model-version';
import {
  PRICE_ADJUSTMENT_VERSION,
  RETURN_PRICE_BASIS,
  calculateForwardReturnPct,
  normalizeYahooOhlcRows,
  selectPriceSeries,
  type CorporateActionStatus,
  type PriceBasis,
} from '@/shared/market/price-basis';

const CALIBRATION_BUCKETS: LensScoreBucket[] = ['80-100', '70-79', '60-69', '<60'];
const VISIBLE_CHART_BUCKETS: LensScoreBucket[] = ['80-100', '70-79', '60-69'];
const OPEN_FETCH_BATCH_SIZE = 12;
const MIN_EFFECTIVE_T_TEST_SAMPLES = 30;

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

interface NormalizedHistoryEntry {
  date: string;
  ticker: string;
  lensScore: number;
  closePrice: number;
  rawClosePrice: number | null;
  adjustedClosePrice: number;
  priceBasis: PriceBasis;
  adjustmentVersion: string;
  corporateActionStatus: CorporateActionStatus;
  marketCap: number | null;
  bucket: LensScoreBucket;
}

export interface CalibrationObservation {
  ticker: string;
  signalDate: string;
  entryDate: string;
  exitDateT20: string | null;
  lensScore: number;
  bucket: LensScoreBucket;
  marketCap: number | null;
  returnT5: number | null;
  returnT20: number | null;
}

export interface CalibrationBucketChartRow {
  bucket: LensScoreBucket;
  avgReturnT20: number | null;
  totalSamples: number;
}

export interface CalibrationTTestResult {
  comparison: '80-100 > <60';
  method: 'Welch one-tailed t-test';
  highBucketSamples: number;
  lowBucketSamples: number;
  highAvgT20: number | null;
  lowAvgT20: number | null;
  tStatistic: number | null;
  degreesOfFreedom: number | null;
  pValue: number | null;
  significant: boolean;
  conclusion: string;
}

export interface ThresholdSimulation {
  threshold: number;
  avgReturnT20: number | null;
  winRateT20: number | null;
  totalSignals: number;
  signalDeltaPctVs80: number | null;
  winRateDeltaPctVs80: number | null;
}

export interface CalibrationDashboardData {
  asOfDate: string;
  latestStatsRunDate: string | null;
  scoreVersion: string | null;
  requestedScoreVersion: string;
  rejectedRows: number;
  unversionedRows: number;
  versionMixed: boolean;
  versionRejectedReason: string | null;
  priceBasis: PriceBasis;
  priceDataVersion: string;
  sourceRows: number;
  uniqueTickers: number;
  observationsT20: number;
  chart: CalibrationBucketChartRow[];
  tTest: CalibrationTTestResult;
  thresholdSimulations: ThresholdSimulation[];
}

export interface ThresholdRecommendation {
  threshold: number | null;
  text: string;
  aiGenerated: boolean;
  frozen?: boolean;
  supportingSimulation: ThresholdSimulation | null;
  baseline80: ThresholdSimulation | null;
}

class YahooDailyOpenProvider implements DailyOpenProvider {
  async getDailyOpenBars(ticker: string): Promise<DailyOpenBar[]> {
    const history = await fetchYahooHistory(ticker, '5y');
    const normalized = normalizeYahooOhlcRows(history?.history ?? [], ticker, history?.regularMarketTime ? new Date(history.regularMarketTime * 1000).toISOString() : null);
    return selectPriceSeries(normalized, RETURN_PRICE_BASIS).bars
      .map((bar) => ({
        date: bar.date,
        open: bar.open,
        close: bar.close,
        priceBasis: bar.basis,
        adjustmentVersion: bar.adjustmentVersion,
        corporateActionStatus: bar.corporateActionStatus,
      }));
  }
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

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function bucketFor(score: number): LensScoreBucket | null {
  if (!Number.isFinite(score) || score < 0 || score > 100) return null;
  if (score >= 80) return '80-100';
  if (score >= 70) return '70-79';
  if (score >= 60) return '60-69';
  return '<60';
}

function isValidCorporateActionStatus(status: CorporateActionStatus | string | null | undefined): status is CorporateActionStatus {
  return !status || ![
    'SUSPECTED_CORPORATE_ACTION',
    'UNRESOLVED_CORPORATE_ACTION',
    'LEGACY_UNKNOWN_PRICE_BASIS',
    'UNRESOLVED_SECURITY_IDENTITY',
  ].includes(status);
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

function variance(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = average(values);
  if (avg == null) return null;
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
}

function winRate(values: number[]): number | null {
  if (!values.length) return null;
  return (values.filter((value) => value > 0).length / values.length) * 100;
}

function normalizeHistory(rows: LensRadarHistoryEntry[]): NormalizedHistoryEntry[] {
  return rows
    .map((row) => {
      const date = dateKey(row.date);
      const ticker = typeof row.ticker === 'string' ? row.ticker.trim().toUpperCase() : '';
      const lensScore = finiteNumber(row.lens_score);
      const rawClosePrice = finiteNumber(row.raw_close_price ?? row.close_price);
      const adjustedClosePrice = finiteNumber(row.adjusted_close_price ?? null);
      const priceBasis = row.price_basis === RETURN_PRICE_BASIS ? RETURN_PRICE_BASIS : 'UNKNOWN';
      const marketCap = finiteNumber(row.market_cap);
      // Gerbang likuiditas yang sama dengan bucket-backtest. Kalau t-test dan equity
      // curve memakai sampel yang lebih longgar daripada tabel bucket, dua angka di
      // halaman transparansi yang sama akan bicara tentang populasi trade berbeda.
      const avgValue20d = finiteNumber(row.avg_value_20d ?? null);
      if (
        !date ||
        !ticker ||
        lensScore == null ||
        priceBasis !== RETURN_PRICE_BASIS ||
        !isFinitePositive(adjustedClosePrice) ||
        avgValue20d == null ||
        avgValue20d < LENS_BUCKET_MIN_AVG_VALUE_20D_IDR ||
        !isValidCorporateActionStatus(row.corporate_action_status)
      ) return null;
      const bucket = bucketFor(lensScore);
      if (!bucket) return null;
      return {
        date,
        ticker,
        lensScore,
        closePrice: adjustedClosePrice,
        rawClosePrice,
        adjustedClosePrice,
        priceBasis,
        adjustmentVersion: row.price_data_version ?? PRICE_ADJUSTMENT_VERSION,
        corporateActionStatus: (row.corporate_action_status as CorporateActionStatus) ?? 'NONE',
        marketCap,
        bucket,
      };
    })
    .filter((row): row is NormalizedHistoryEntry => row !== null)
    .sort((a, b) => a.ticker.localeCompare(b.ticker) || a.date.localeCompare(b.date));
}

async function loadOpenMaps(
  tickers: string[],
  provider: DailyOpenProvider
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  for (let i = 0; i < tickers.length; i += OPEN_FETCH_BATCH_SIZE) {
    const batch = tickers.slice(i, i + OPEN_FETCH_BATCH_SIZE);
    const barsList = await Promise.all(batch.map(async (ticker) => ({
      ticker,
      bars: await provider.getDailyOpenBars(ticker).catch(() => []),
    })));
    for (const { ticker, bars } of barsList) {
      result.set(ticker, new Map(
        bars
          .filter((bar) => bar.priceBasis === RETURN_PRICE_BASIS && isFinitePositive(bar.open))
          .map((bar) => [bar.date, bar.open])
      ));
    }
  }
  return result;
}

export async function calculateCalibrationObservations(
  rows: LensRadarHistoryEntry[],
  provider: DailyOpenProvider = new YahooDailyOpenProvider(),
  options: { scoreVersion?: string | null } = {}
): Promise<{
  normalizedRows: number;
  uniqueTickers: number;
  observations: CalibrationObservation[];
  scoreVersion: string | null;
  requestedScoreVersion: string;
  rejectedRows: number;
  unversionedRows: number;
  versionMixed: boolean;
  versionRejectedReason: string | null;
}> {
  const requestedScoreVersion = options.scoreVersion?.trim() || SCORE_VERSION;
  const partition = partitionByScoreVersion(rows, requestedScoreVersion);
  const normalized = normalizeHistory(partition.accepted);
  const tradingCalendar = buildTradingCalendar(normalized);
  const calendarIndex = new Map(tradingCalendar.map((date, index) => [date, index]));
  const byTicker = new Map<string, NormalizedHistoryEntry[]>();
  for (const row of normalized) {
    const list = byTicker.get(row.ticker) ?? [];
    list.push(row);
    byTicker.set(row.ticker, list);
  }

  const tickers = Array.from(byTicker.keys());
  const openMaps = await loadOpenMaps(tickers, provider);
  const observations: CalibrationObservation[] = [];

  for (const [ticker, series] of Array.from(byTicker.entries())) {
    const openByDate = openMaps.get(ticker) ?? new Map<string, number>();
    const byDate = new Map(series.map((row) => [row.date, row]));
    for (let i = 0; i < series.length; i++) {
      const signal = series[i];
      if (!signal) continue;
      const signalCalendarIndex = calendarIndex.get(signal.date);
      if (signalCalendarIndex == null) continue;
      const entry = barAtTradingOffset(byDate, tradingCalendar, signalCalendarIndex, 1);
      if (!entry) continue;
      const entryOpen = openByDate.get(entry.date);
      if (!isFinitePositive(entryOpen)) continue;

      const exitT5 = barAtTradingOffset(byDate, tradingCalendar, signalCalendarIndex, 5);
      const exitT20 = barAtTradingOffset(byDate, tradingCalendar, signalCalendarIndex, 20);

      const toReturn = (exit: NormalizedHistoryEntry | null): number | null => {
        if (!exit || !isFinitePositive(exit.closePrice)) return null;
        if (hasCorporateActionGap(series, entry.date, exit.date)) return null;
        const ret = calculateForwardReturnPct({
          ticker,
          entryBar: {
            date: entry.date,
            ticker,
            raw: { open: null, high: null, low: null, close: entry.rawClosePrice },
            adjusted: { open: entryOpen, high: null, low: null, close: entry.adjustedClosePrice },
            adjustmentFactor: null,
            adjustmentStatus: 'DERIVED_FROM_ADJUSTMENT_FACTOR',
            corporateActionStatus: entry.corporateActionStatus,
            basisAvailability: { raw: false, adjusted: true },
            source: 'LENS_RADAR_HISTORY+YAHOO_CHART',
            dataTimestamp: null,
            metadata: { priceBasis: RETURN_PRICE_BASIS, adjustmentSource: 'YAHOO_CHART_ADJCLOSE', adjustmentTimestamp: null, adjustmentVersion: entry.adjustmentVersion },
          },
          exitBar: {
            date: exit.date,
            ticker,
            raw: { open: null, high: null, low: null, close: exit.rawClosePrice },
            adjusted: { open: null, high: null, low: null, close: exit.adjustedClosePrice },
            adjustmentFactor: null,
            adjustmentStatus: 'DERIVED_FROM_ADJUSTMENT_FACTOR',
            corporateActionStatus: exit.corporateActionStatus,
            basisAvailability: { raw: false, adjusted: true },
            source: 'LENS_RADAR_HISTORY',
            dataTimestamp: null,
            metadata: { priceBasis: RETURN_PRICE_BASIS, adjustmentSource: 'YAHOO_CHART_ADJCLOSE', adjustmentTimestamp: null, adjustmentVersion: exit.adjustmentVersion },
          },
          basis: RETURN_PRICE_BASIS,
          entryField: 'open',
          exitField: 'close',
          roundTripCostPct: LENS_BUCKET_ROUND_TRIP_COST_PCT,
        });
        return ret.status === 'OK' ? ret.returnPct : null;
      };

      const returnT20 = toReturn(exitT20);

      observations.push({
        ticker,
        signalDate: signal.date,
        entryDate: entry.date,
        exitDateT20: returnT20 == null ? null : exitT20?.date ?? null,
        lensScore: signal.lensScore,
        bucket: signal.bucket,
        marketCap: signal.marketCap,
        returnT5: toReturn(exitT5),
        returnT20,
      });
    }
  }

  return {
    normalizedRows: normalized.length,
    uniqueTickers: tickers.length,
    observations,
    scoreVersion: partition.version,
    requestedScoreVersion,
    rejectedRows: partition.rejected.length,
    unversionedRows: partition.unversionedCount,
    versionMixed: partition.mixed,
    versionRejectedReason: partition.rejectedReason,
  };
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

async function readLatestBucketStats(
  db: Queryable = pool,
  scoreVersion = SCORE_VERSION
): Promise<{ runDate: string | null; rows: CalibrationBucketChartRow[] }> {
  const { rows } = await db.query(
    `
    WITH latest AS (
      SELECT MAX(run_date) AS run_date
      FROM lens_bucket_stats
      WHERE score_version = $1
        AND price_basis = $2
    )
    SELECT s.run_date::text AS run_date, s.bucket, s.avg_t20, s.total_samples, s.score_version, s.price_basis
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

  const runDate = typeof rows[0]?.run_date === 'string' ? rows[0].run_date.slice(0, 10) : null;
  return {
    runDate,
    rows: rows.map((row) => ({
      bucket: row.bucket as LensScoreBucket,
      avgReturnT20: roundPct(finiteNumber(row.avg_t20)),
      totalSamples: Number(row.total_samples ?? 0),
    })),
  };
}

function lnGamma(z: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - lnGamma(1 - z);
  let x = 0.99999999999980993;
  const zz = z - 1;
  for (let i = 0; i < coefficients.length; i++) {
    x += coefficients[i] / (zz + i + 1);
  }
  const t = zz + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 100;
  const epsilon = 3e-7;
  const tiny = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;

    aa = -((a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < epsilon) break;
  }
  return h;
}

function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

function studentTCdf(t: number, df: number): number {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return Number.NaN;
  const x = df / (df + t * t);
  const ib = regularizedBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

export function welchOneTailedGreater(
  a: number[],
  b: number[],
  options: { minSamplesPerBucket?: number; sampleNote?: string } = {}
): CalibrationTTestResult {
  const aAvg = average(a);
  const bAvg = average(b);
  const minSamples = options.minSamplesPerBucket ?? 2;
  const insufficient = a.length < minSamples || b.length < minSamples || aAvg == null || bAvg == null;
  if (insufficient) {
    return {
      comparison: '80-100 > <60',
      method: 'Welch one-tailed t-test',
      highBucketSamples: a.length,
      lowBucketSamples: b.length,
      highAvgT20: roundPct(aAvg),
      lowAvgT20: roundPct(bAvg),
      tStatistic: null,
      degreesOfFreedom: null,
      pValue: null,
      significant: false,
      conclusion: `Data belum cukup untuk t-test minimal ${minSamples} sampel efektif per bucket.${options.sampleNote ? ` ${options.sampleNote}` : ''}`,
    };
  }

  const aVar = variance(a)!;
  const bVar = variance(b)!;
  const se2 = aVar / a.length + bVar / b.length;
  if (se2 <= 0) {
    return {
      comparison: '80-100 > <60',
      method: 'Welch one-tailed t-test',
      highBucketSamples: a.length,
      lowBucketSamples: b.length,
      highAvgT20: roundPct(aAvg),
      lowAvgT20: roundPct(bAvg),
      tStatistic: null,
      degreesOfFreedom: null,
      pValue: null,
      significant: false,
      conclusion: 'Variansi return nol; t-test tidak informatif.',
    };
  }

  const t = (aAvg - bAvg) / Math.sqrt(se2);
  const dfNumerator = se2 ** 2;
  const dfDenominator = ((aVar / a.length) ** 2) / (a.length - 1) + ((bVar / b.length) ** 2) / (b.length - 1);
  const df = dfNumerator / dfDenominator;
  const pValue = 1 - studentTCdf(t, df);
  const significant = Number.isFinite(pValue) && pValue < 0.05;

  return {
    comparison: '80-100 > <60',
    method: 'Welch one-tailed t-test',
    highBucketSamples: a.length,
    lowBucketSamples: b.length,
    highAvgT20: roundPct(aAvg),
    lowAvgT20: roundPct(bAvg),
    tStatistic: roundPct(t, 4),
    degreesOfFreedom: roundPct(df, 2),
    pValue: roundPct(pValue, 4),
    significant,
    conclusion: `${significant
      ? 'Bucket 80-100 unggul signifikan atas bucket <60 pada alpha 5%.'
      : 'Belum terbukti signifikan pada alpha 5%; perlu lebih banyak sampel atau edge belum stabil.'}${options.sampleNote ? ` ${options.sampleNote}` : ''}`,
  };
}

export function decorrelateCalibrationObservations(
  observations: CalibrationObservation[],
  holdingDays = LENS_RADAR_HOLDING_DAYS
): CalibrationObservation[] {
  return decorrelateByTicker(observations, holdingDays);
}

export function buildCalibrationTTest(observations: CalibrationObservation[]): CalibrationTTestResult {
  const effective = decorrelateCalibrationObservations(
    observations.filter((obs) => typeof obs.returnT20 === 'number')
  );
  const highT20 = effective
    .filter((obs) => obs.bucket === '80-100')
    .map((obs) => obs.returnT20 as number);
  const lowT20 = effective
    .filter((obs) => obs.bucket === '<60')
    .map((obs) => obs.returnT20 as number);

  const result = welchOneTailedGreater(highT20, lowT20, {
    minSamplesPerBucket: MIN_EFFECTIVE_T_TEST_SAMPLES,
    sampleNote: 'Sampel didekorelasikan per ticker per 20 hari bursa; korelasi silang antar emiten/rezim pasar masih caveat.',
  });
  return PRODUCT_VALIDATION_STATUS === 'RESEARCH_ONLY' ? suppressUnvalidatedSignificance(result) : result;
}

function chartFromObservations(observations: CalibrationObservation[]): CalibrationBucketChartRow[] {
  return VISIBLE_CHART_BUCKETS.map((bucket) => {
    const values = observations
      .filter((obs) => obs.bucket === bucket && typeof obs.returnT20 === 'number')
      .map((obs) => obs.returnT20 as number);
    return {
      bucket,
      avgReturnT20: roundPct(average(values)),
      totalSamples: values.length,
    };
  });
}

export function calculateThresholdSimulations(observations: CalibrationObservation[]): ThresholdSimulation[] {
  const baselineValues = observations
    .filter((obs) => obs.lensScore >= 80 && typeof obs.returnT20 === 'number')
    .map((obs) => obs.returnT20 as number);
  const baselineSignals = baselineValues.length;
  const baselineWinRate = winRate(baselineValues);

  const simulations: ThresholdSimulation[] = [];
  for (let threshold = 60; threshold <= 90; threshold++) {
    const values = observations
      .filter((obs) => obs.lensScore >= threshold && typeof obs.returnT20 === 'number')
      .map((obs) => obs.returnT20 as number);
    const wr = winRate(values);
    simulations.push({
      threshold,
      avgReturnT20: roundPct(average(values)),
      winRateT20: roundPct(wr),
      totalSignals: values.length,
      signalDeltaPctVs80: baselineSignals > 0 ? roundPct(((values.length / baselineSignals) - 1) * 100) : null,
      winRateDeltaPctVs80: baselineWinRate != null && wr != null ? roundPct(wr - baselineWinRate) : null,
    });
  }
  return simulations;
}

function chooseBestThreshold(simulations: ThresholdSimulation[]): ThresholdSimulation | null {
  const baseline = simulations.find((sim) => sim.threshold === 80) ?? null;
  const minimumSamples = Math.max(5, Math.floor((baseline?.totalSignals ?? 0) * 0.5));
  const candidates = simulations.filter((sim) => sim.totalSignals >= minimumSamples && sim.winRateT20 != null);
  if (!candidates.length) return baseline;

  return candidates.reduce((best, sim) => {
    const sampleBoost = baseline && baseline.totalSignals > 0
      ? Math.log(Math.max(sim.totalSignals, 1) / baseline.totalSignals) * 8
      : 0;
    const returnScore = (sim.avgReturnT20 ?? 0) * 1.5;
    const score = (sim.winRateT20 ?? 0) + returnScore + sampleBoost;
    const bestScore = (best.winRateT20 ?? 0) + ((best.avgReturnT20 ?? 0) * 1.5) + (
      baseline && baseline.totalSignals > 0
        ? Math.log(Math.max(best.totalSignals, 1) / baseline.totalSignals) * 8
        : 0
    );
    return score > bestScore ? sim : best;
  }, candidates[0]);
}

function buildFallbackRecommendation(best: ThresholdSimulation | null, baseline: ThresholdSimulation | null): ThresholdRecommendation {
  if (!best || !baseline || best.winRateT20 == null) {
    return {
      threshold: null,
      text: 'Data belum cukup untuk merekomendasikan ambang baru. Tunggu histori LensRadar bertambah agar sampel T+20 lebih stabil.',
      aiGenerated: false,
      supportingSimulation: best,
      baseline80: baseline,
    };
  }

  const signalText = best.signalDeltaPctVs80 == null
    ? `${best.totalSignals} sinyal`
    : `${Math.abs(best.signalDeltaPctVs80).toFixed(0)}% ${best.signalDeltaPctVs80 >= 0 ? 'lebih banyak' : 'lebih sedikit'} sinyal vs ambang 80`;
  return {
    threshold: best.threshold,
    text: `Ambang ${best.threshold} paling layak diuji: win rate T+20 ${best.winRateT20.toFixed(2)}% dengan ${signalText}. Avg return T+20 ${best.avgReturnT20?.toFixed(2) ?? '-'}%.`,
    aiGenerated: false,
    supportingSimulation: best,
    baseline80: baseline,
  };
}

export async function getCalibrationDashboardData(
  db: Queryable = pool,
  provider: DailyOpenProvider = new YahooDailyOpenProvider(),
  options: { scoreVersion?: string | null } = {}
): Promise<CalibrationDashboardData> {
  await ensureSharedSchema();
  const requestedScoreVersion = options.scoreVersion?.trim() || SCORE_VERSION;
  const [latestStats, historyRows] = await Promise.all([
    readLatestBucketStats(db, requestedScoreVersion),
    readLensRadarHistory(db),
  ]);
  const {
    normalizedRows,
    uniqueTickers,
    observations,
    scoreVersion,
    rejectedRows,
    unversionedRows,
    versionMixed,
    versionRejectedReason,
  } = await calculateCalibrationObservations(historyRows, provider, { scoreVersion: requestedScoreVersion });
  const observationsT20 = observations.filter((obs) => typeof obs.returnT20 === 'number').length;
  const latestChartRows = latestStats.rows.filter((row) => VISIBLE_CHART_BUCKETS.includes(row.bucket));
  const chart = latestChartRows.length ? latestChartRows : chartFromObservations(observations);

  return {
    asOfDate: todayDateKeyWIB(),
    latestStatsRunDate: latestStats.runDate,
    scoreVersion,
    requestedScoreVersion,
    rejectedRows,
    unversionedRows,
    versionMixed,
    versionRejectedReason,
    priceBasis: RETURN_PRICE_BASIS,
    priceDataVersion: PRICE_ADJUSTMENT_VERSION,
    sourceRows: normalizedRows,
    uniqueTickers,
    observationsT20,
    chart,
    tTest: buildCalibrationTTest(observations),
    thresholdSimulations: calculateThresholdSimulations(observations),
  };
}

export async function recommendCalibrationThreshold(
  db: Queryable = pool,
  provider: DailyOpenProvider = new YahooDailyOpenProvider()
): Promise<ThresholdRecommendation> {
  if (!THRESHOLD_RECOMMENDER_ENABLED) {
    return {
      threshold: null,
      text: 'Rekomendasi ambang otomatis dibekukan sampai tersedia validasi out-of-sample dan koreksi pengujian berganda. Data saat ini tetap boleh dipakai untuk riset, bukan perubahan ambang produksi.',
      aiGenerated: false,
      frozen: true,
      supportingSimulation: null,
      baseline80: null,
    };
  }
  const data = await getCalibrationDashboardData(db, provider);
  const best = chooseBestThreshold(data.thresholdSimulations);
  const baseline = data.thresholdSimulations.find((sim) => sim.threshold === 80) ?? null;
  const fallback = buildFallbackRecommendation(best, baseline);

  if (!best || !baseline || !hasAnyAIProvider()) return fallback;

  const prompt = [
    'Anda adalah senior quantitative reviewer pasar modal Indonesia untuk SahamLens.',
    'Berikan rekomendasi ambang LensScore optimal berdasarkan data backtest point-in-time berikut.',
    'Gunakan bahasa Indonesia, 1 kalimat utama + 1 kalimat catatan risiko. Jangan mengarang data.',
    `Data as-of ${data.asOfDate}. Cost round-trip sudah dikurangkan ${LENS_BUCKET_ROUND_TRIP_COST_PCT}%.`,
    `T-test 80-100 > <60: p-value=${data.tTest.pValue ?? 'NA'}, signifikan=${data.tTest.significant}.`,
    `Baseline ambang 80: winRate=${baseline.winRateT20 ?? 'NA'}%, sinyal=${baseline.totalSignals}, avgReturn=${baseline.avgReturnT20 ?? 'NA'}%.`,
    `Kandidat terbaik rule-based: ambang ${best.threshold}, winRate=${best.winRateT20 ?? 'NA'}%, sinyal=${best.totalSignals}, avgReturn=${best.avgReturnT20 ?? 'NA'}%, deltaSinyalVs80=${best.signalDeltaPctVs80 ?? 'NA'}%.`,
    'Format contoh: "Ambang 78 lebih optimal: win rate 55% dengan 30% lebih banyak sinyal vs ambang 80. Catatan: ..."',
  ].join('\n');

  const text = await generateAI({
    system: 'Jawab sebagai reviewer quant independen. Dilarang memberi saran beli/jual saham individual.',
    prompt,
    timeoutMs: 8000,
  });

  return text?.trim()
    ? { ...fallback, aiGenerated: true, text: text.trim() }
    : fallback;
}
