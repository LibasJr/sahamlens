import { cacheGet, cacheSet, cacheMGet } from '../../../shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '../../../shared/cache/ttl-policy';
import type { BacktestIndicatorCache, TickerIndicatorSeries, DailyBar } from '../types/backtest.types';

const META_KEY = 'sahamlens:cache:computed:backtest-indicators:v1:meta';
const tickerKey = (ticker: string) => `sahamlens:cache:computed:backtest-indicators:v1:ticker:${ticker}`;

interface CacheMeta {
  computedAt: string;
  ihsg: DailyBar[];
  tickers: string[];
}

export async function writeBacktestCache(data: BacktestIndicatorCache): Promise<void> {
  const meta: CacheMeta = {
    computedAt: data.computedAt,
    ihsg: data.ihsg,
    tickers: data.tickers.map((t) => t.ticker),
  };
  await cacheSet(META_KEY, meta, CACHE_TTL_SEC.BACKTEST_INDICATORS);
  for (const series of data.tickers) {
    await cacheSet(tickerKey(series.ticker), series, CACHE_TTL_SEC.BACKTEST_INDICATORS);
  }
}

export async function readBacktestCache(): Promise<BacktestIndicatorCache | null> {
  const meta = await cacheGet<CacheMeta>(META_KEY);
  if (!meta) return null;

  const keys = meta.tickers.map(tickerKey);
  const seriesList = await cacheMGet<TickerIndicatorSeries>(keys);
  const tickers = seriesList.filter((s): s is TickerIndicatorSeries => s !== null);

  return { computedAt: meta.computedAt, ihsg: meta.ihsg, tickers };
}
