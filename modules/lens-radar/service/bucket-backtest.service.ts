import { pool } from '../../../shared/database/postgres.client';
import { ensureSharedSchema } from '../../../shared/database/schema.service';
import { todayDateKeyWIB } from '../../../shared/market/trading-session';
import { fetchYahooHistory } from '../../technical';

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
}

export interface DailyOpenBar {
  date: string;
  open: number;
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
  marketCap: number | null;
  bucket: LensScoreBucket;
}

class YahooDailyOpenProvider implements DailyOpenProvider {
  async getDailyOpenBars(ticker: string): Promise<DailyOpenBar[]> {
    const history = await fetchYahooHistory(ticker, '5y');
    return (history?.history ?? [])
      .map((bar) => ({ date: bar.Date.split('T')[0], open: bar.Open }))
      .filter((bar) => isFinitePositive(bar.open));
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
      const closePrice = finiteNumber(row.close_price);
      const marketCap = finiteNumber(row.market_cap);
      if (!date || !ticker || lensScore == null || !isFinitePositive(closePrice)) return null;
      const bucket = bucketFor(lensScore);
      if (!bucket) return null;
      return { date, ticker, lensScore, closePrice, marketCap, bucket };
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
      result.set(ticker, new Map(bars.map((bar) => [bar.date, bar.open])));
    }
  }
  return result;
}

export async function calculateLensBucketStats(
  rows: LensRadarHistoryEntry[],
  provider: DailyOpenProvider = new YahooDailyOpenProvider(),
  asOfDate = todayDateKeyWIB()
): Promise<LensBucketBacktestResult> {
  const normalized = normalizeHistory(rows);
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
    for (let i = 0; i < series.length; i++) {
      const signal = series[i];
      if (!signal) continue;
      const entry = series[i + 1];
      if (!entry) continue;
      const entryOpen = openByDate.get(entry.date);
      if (!isFinitePositive(entryOpen)) continue;

      const closeT1 = series[i + 1]?.closePrice ?? null;
      const closeT5 = series[i + 5]?.closePrice ?? null;
      const closeT20 = series[i + 20]?.closePrice ?? null;

      const addReturn = (horizon: ForwardHorizon, exitClose: number | null) => {
        if (!isFinitePositive(exitClose)) return;
        const grossPct = ((exitClose / entryOpen) - 1) * 100;
        const netReturn = grossPct - LENS_BUCKET_ROUND_TRIP_COST_PCT;
        returns[signal.bucket][horizon].push(netReturn);
        if (horizon === 'T20') {
          t20DatedReturns[signal.bucket].push({ date: signal.date, returnPct: netReturn });
        }
      };

      addReturn('T1', closeT1);
      addReturn('T5', closeT5);
      addReturn('T20', closeT20);
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
    sourceRows: normalized.length,
    uniqueTickers: tickers.length,
    roundTripCostPct: LENS_BUCKET_ROUND_TRIP_COST_PCT,
    stats,
  };
}

export async function readLensRadarHistory(db: Queryable = pool): Promise<LensRadarHistoryEntry[]> {
  const { rows } = await db.query(
    `
    SELECT "date", ticker, lens_score, close_price, market_cap
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
        source_rows, unique_tickers, round_trip_cost_pct, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
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
      ]
    );
    saved++;
  }
  return saved;
}

export async function runAndSaveLensBucketBacktest(
  db: Queryable = pool,
  provider: DailyOpenProvider = new YahooDailyOpenProvider(),
  asOfDate = todayDateKeyWIB()
): Promise<LensBucketBacktestResult & { savedRows: number }> {
  await ensureSharedSchema();
  const rows = await readLensRadarHistory(db);
  const result = await calculateLensBucketStats(rows, provider, asOfDate);
  const savedRows = await saveLensBucketStats(result, db);
  return { ...result, savedRows };
}
