import { pool } from '../../../shared/database/postgres.client';
import { ensureSharedSchema } from '../../../shared/database/schema.service';
import { todayDateKeyWIB } from '../../../shared/market/trading-session';
import { fetchYahooHistory } from '../../technical';
import {
  barAtTradingOffset,
  buildTradingCalendar,
  hasCorporateActionGap,
} from './history-return-utils';
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

export const LENS_BUCKET_ROUND_TRIP_COST_PCT = 0.5; // fee 0.4% + slippage 0.1%

export type LensScoreBucket = '80-100' | '70-79' | '60-69' | '<60';
export type ForwardHorizon = 'T1' | 'T5' | 'T20';

const BUCKETS: LensScoreBucket[] = ['80-100', '70-79', '60-69', '<60'];
const BATCH_SIZE = 12;

export interface LensRadarHistoryEntry {
  date: string | Date;
  ticker: string;
  lens_score: number | string;
  close_price: number | string;
  market_cap: number | string | null;
  score_version?: string | null;
  raw_close_price?: number | string | null;
  adjusted_close_price?: number | string | null;
  price_basis?: PriceBasis | string | null;
  adjustment_factor?: number | string | null;
  corporate_action_status?: CorporateActionStatus | string | null;
  price_data_timestamp?: string | Date | null;
  price_data_version?: string | null;
}

export interface DailyOpenBar {
  date: string;
  open: number;
  close?: number;
  priceBasis?: PriceBasis;
  adjustmentVersion?: string;
  corporateActionStatus?: CorporateActionStatus;
}

export interface LensBucketStat {
  bucket: LensScoreBucket;
  avg_T1: number | null;
  avg_T5: number | null;
  avg_T20: number | null;
  winRate_T5: number | null;
  winRate_T20: number | null;
  maxDrawdown_T20: number | null;
  avgWin_T20: number | null;
  avgLoss_T20: number | null;
  totalSamples: number;
}

export interface LensBucketBacktestResult {
  asOfDate: string;
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
  roundTripCostPct: number;
  stats: LensBucketStat[];
}

export interface DailyOpenProvider {
  getDailyOpenBars(ticker: string): Promise<DailyOpenBar[]>;
}

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

interface NormalizedEntry {
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

function roundPct(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function winRate(values: number[]): number | null {
  if (!values.length) return null;
  return (values.filter((value) => value > 0).length / values.length) * 100;
}

function normalizeHistory(rows: LensRadarHistoryEntry[]): NormalizedEntry[] {
  return rows
    .map((row) => {
      const date = dateKey(row.date);
      const ticker = typeof row.ticker === 'string' ? row.ticker.trim().toUpperCase() : '';
      const lensScore = finiteNumber(row.lens_score);
      const rawClosePrice = finiteNumber(row.raw_close_price ?? row.close_price);
      const adjustedClosePrice = finiteNumber(row.adjusted_close_price ?? null);
      const priceBasis = row.price_basis === RETURN_PRICE_BASIS ? RETURN_PRICE_BASIS : 'UNKNOWN';
      const marketCap = finiteNumber(row.market_cap);
      if (
        !date ||
        !ticker ||
        lensScore == null ||
        priceBasis !== RETURN_PRICE_BASIS ||
        !isFinitePositive(adjustedClosePrice) ||
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
    .filter((row): row is NormalizedEntry => row !== null)
    .sort((a, b) => a.ticker.localeCompare(b.ticker) || a.date.localeCompare(b.date));
}

function initReturns(): Record<LensScoreBucket, Record<ForwardHorizon, number[]>> {
  return BUCKETS.reduce((acc, bucket) => {
    acc[bucket] = { T1: [], T5: [], T20: [] };
    return acc;
  }, {} as Record<LensScoreBucket, Record<ForwardHorizon, number[]>>);
}

function initDatedReturns(): Record<LensScoreBucket, { date: string; returnPct: number }[]> {
  return BUCKETS.reduce((acc, bucket) => {
    acc[bucket] = [];
    return acc;
  }, {} as Record<LensScoreBucket, { date: string; returnPct: number }[]>);
}

function maxDrawdownPct(values: { date: string; returnPct: number }[]): number | null {
  if (!values.length) return null;
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const item of [...values].sort((a, b) => a.date.localeCompare(b.date))) {
    equity *= 1 + item.returnPct / 100;
    peak = Math.max(peak, equity);
    const drawdown = ((equity / peak) - 1) * 100;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
  }
  return maxDrawdown;
}

async function loadOpenMaps(
  tickers: string[],
  provider: DailyOpenProvider
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
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

export async function calculateLensBucketStats(
  rows: LensRadarHistoryEntry[],
  provider: DailyOpenProvider = new YahooDailyOpenProvider(),
  asOfDate = todayDateKeyWIB(),
  options: { scoreVersion?: string | null } = {}
): Promise<LensBucketBacktestResult> {
  const requestedScoreVersion = options.scoreVersion?.trim() || SCORE_VERSION;
  const partition = partitionByScoreVersion(rows, requestedScoreVersion);
  const normalized = normalizeHistory(partition.accepted);
  const tradingCalendar = buildTradingCalendar(normalized);
  const calendarIndex = new Map(tradingCalendar.map((date, index) => [date, index]));
  const byTicker = new Map<string, NormalizedEntry[]>();
  for (const row of normalized) {
    const list = byTicker.get(row.ticker) ?? [];
    list.push(row);
    byTicker.set(row.ticker, list);
  }

  const tickers = Array.from(byTicker.keys());
  const openMaps = await loadOpenMaps(tickers, provider);
  const returns = initReturns();
  const t20DatedReturns = initDatedReturns();

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

      const exitT1 = entry;
      const exitT5 = barAtTradingOffset(byDate, tradingCalendar, signalCalendarIndex, 5);
      const exitT20 = barAtTradingOffset(byDate, tradingCalendar, signalCalendarIndex, 20);

      const addReturn = (horizon: ForwardHorizon, exit: NormalizedEntry | null) => {
        if (!exit || !isFinitePositive(exit.closePrice)) return;
        if (hasCorporateActionGap(series, entry.date, exit.date)) return;
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
        if (ret.status !== 'OK' || ret.returnPct == null) return;
        const netReturn = ret.returnPct;
        returns[signal.bucket][horizon].push(netReturn);
        if (horizon === 'T20') {
          t20DatedReturns[signal.bucket].push({ date: signal.date, returnPct: netReturn });
        }
      };

      addReturn('T1', exitT1);
      addReturn('T5', exitT5);
      addReturn('T20', exitT20);
    }
  }

  const stats = BUCKETS.map((bucket): LensBucketStat => ({
    bucket,
    avg_T1: roundPct(average(returns[bucket].T1)),
    avg_T5: roundPct(average(returns[bucket].T5)),
    avg_T20: roundPct(average(returns[bucket].T20)),
    winRate_T5: roundPct(winRate(returns[bucket].T5)),
    winRate_T20: roundPct(winRate(returns[bucket].T20)),
    maxDrawdown_T20: roundPct(maxDrawdownPct(t20DatedReturns[bucket])),
    avgWin_T20: roundPct(average(returns[bucket].T20.filter((value) => value > 0))),
    avgLoss_T20: roundPct(average(returns[bucket].T20.filter((value) => value < 0))),
    totalSamples: returns[bucket].T1.length,
  }));

  return {
    asOfDate,
    scoreVersion: partition.version,
    requestedScoreVersion,
    rejectedRows: partition.rejected.length,
    unversionedRows: partition.unversionedCount,
    versionMixed: partition.mixed,
    versionRejectedReason: partition.rejectedReason,
    priceBasis: RETURN_PRICE_BASIS,
    priceDataVersion: PRICE_ADJUSTMENT_VERSION,
    sourceRows: normalized.length,
    uniqueTickers: tickers.length,
    roundTripCostPct: LENS_BUCKET_ROUND_TRIP_COST_PCT,
    stats,
  };
}

export async function readLensRadarHistory(db: Queryable = pool): Promise<LensRadarHistoryEntry[]> {
  const { rows } = await db.query(
    `
    SELECT "date", ticker, lens_score, close_price, market_cap, score_version,
           raw_close_price, adjusted_close_price, price_basis, adjustment_factor,
           corporate_action_status, price_data_timestamp, price_data_version
    FROM lens_radar_history
    WHERE lens_score IS NOT NULL
      AND close_price IS NOT NULL
    ORDER BY ticker ASC, "date" ASC
    `
  );
  return rows as LensRadarHistoryEntry[];
}

export async function saveLensBucketStats(
  result: LensBucketBacktestResult,
  db: Queryable = pool
): Promise<number> {
  await ensureSharedSchema();
  let saved = 0;
  for (const stat of result.stats) {
    await db.query(
      `
      INSERT INTO lens_bucket_stats (
        run_date, bucket, avg_t1, avg_t5, avg_t20,
        win_rate_t5, win_rate_t20, max_drawdown_t20,
        avg_win_t20, avg_loss_t20, total_samples,
        source_rows, unique_tickers, round_trip_cost_pct, score_version,
        price_basis, price_data_version, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now())
      ON CONFLICT (run_date, bucket) DO UPDATE SET
        avg_t1 = EXCLUDED.avg_t1,
        avg_t5 = EXCLUDED.avg_t5,
        avg_t20 = EXCLUDED.avg_t20,
        win_rate_t5 = EXCLUDED.win_rate_t5,
        win_rate_t20 = EXCLUDED.win_rate_t20,
        max_drawdown_t20 = EXCLUDED.max_drawdown_t20,
        avg_win_t20 = EXCLUDED.avg_win_t20,
        avg_loss_t20 = EXCLUDED.avg_loss_t20,
        total_samples = EXCLUDED.total_samples,
        source_rows = EXCLUDED.source_rows,
        unique_tickers = EXCLUDED.unique_tickers,
        round_trip_cost_pct = EXCLUDED.round_trip_cost_pct,
        score_version = EXCLUDED.score_version,
        price_basis = EXCLUDED.price_basis,
        price_data_version = EXCLUDED.price_data_version,
        updated_at = now()
      `,
      [
        result.asOfDate,
        stat.bucket,
        stat.avg_T1,
        stat.avg_T5,
        stat.avg_T20,
        stat.winRate_T5,
        stat.winRate_T20,
        stat.maxDrawdown_T20,
        stat.avgWin_T20,
        stat.avgLoss_T20,
        stat.totalSamples,
        result.sourceRows,
        result.uniqueTickers,
        result.roundTripCostPct,
        result.scoreVersion,
        result.priceBasis,
        result.priceDataVersion,
      ]
    );
    saved++;
  }
  return saved;
}

export async function runAndSaveLensBucketBacktest(
  db: Queryable = pool,
  provider: DailyOpenProvider = new YahooDailyOpenProvider(),
  asOfDate = todayDateKeyWIB(),
  options: { scoreVersion?: string | null } = {}
): Promise<LensBucketBacktestResult & { savedRows: number }> {
  await ensureSharedSchema();
  const rows = await readLensRadarHistory(db);
  const result = await calculateLensBucketStats(rows, provider, asOfDate, options);
  const savedRows = await saveLensBucketStats(result, db);
  return { ...result, savedRows };
}
