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

// Batch write ~100 ticker key sekaligus (bukan satu-satu sekuensial) - dieksekusi
// paralel per chunk supaya tidak menembak 100 request Upstash REST bersamaan dalam
// satu ledakan (pola BATCH_SIZE sama seperti precompute.service.ts).
const WRITE_BATCH_SIZE = 15;

export async function writeBacktestCache(data: BacktestIndicatorCache): Promise<void> {
  const meta: CacheMeta = {
    computedAt: data.computedAt,
    ihsg: data.ihsg,
    tickers: data.tickers.map((t) => t.ticker),
  };
  await cacheSet(META_KEY, meta, CACHE_TTL_SEC.BACKTEST_INDICATORS);

  for (let i = 0; i < data.tickers.length; i += WRITE_BATCH_SIZE) {
    const chunk = data.tickers.slice(i, i + WRITE_BATCH_SIZE);
    await Promise.all(
      chunk.map((series) => cacheSet(tickerKey(series.ticker), series, CACHE_TTL_SEC.BACKTEST_INDICATORS))
    );
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
