import { cacheGet, cacheSet, cacheMGet } from '../../../shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '../../../shared/cache/ttl-policy';
import type { BacktestIndicatorCache, TickerIndicatorSeries, DailyBar } from '../types/backtest.types';

// v3: setiap publikasi memakai namespace snapshot immutable. Pointer/meta baru ditulis
// SETELAH semua shard selesai, jadi reader hanya melihat generasi lama utuh atau baru utuh.
const META_KEY = 'sahamlens:cache:computed:backtest-indicators:v3:active';
const tickerKey = (snapshotId: string, ticker: string) =>
  `sahamlens:cache:computed:backtest-indicators:v3:snapshot:${snapshotId}:ticker:${ticker}`;

interface CacheMeta {
  snapshotId: string;
  computedAt: string;
  ihsg: DailyBar[];
  tickers: string[];
}

// Batch write ~100 ticker key sekaligus (bukan satu-satu sekuensial) - dieksekusi
// paralel per chunk supaya tidak menembak 100 request Upstash REST bersamaan dalam
// satu ledakan (pola BATCH_SIZE sama seperti precompute.service.ts).
const WRITE_BATCH_SIZE = 15;

export async function writeBacktestCache(data: BacktestIndicatorCache): Promise<void> {
  const snapshotId = crypto.randomUUID();
  const shardTtl = CACHE_TTL_SEC.BACKTEST_INDICATORS * 2;

  for (let i = 0; i < data.tickers.length; i += WRITE_BATCH_SIZE) {
    const chunk = data.tickers.slice(i, i + WRITE_BATCH_SIZE);
    await Promise.all(
      chunk.map((series) => cacheSet(tickerKey(snapshotId, series.ticker), series, shardTtl))
    );
  }

  const meta: CacheMeta = {
    snapshotId,
    computedAt: data.computedAt,
    ihsg: data.ihsg,
    tickers: data.tickers.map((t) => t.ticker),
  };
  // Publish terakhir. Gagal sebelum titik ini membiarkan pointer lama tetap aktif.
  await cacheSet(META_KEY, meta, CACHE_TTL_SEC.BACKTEST_INDICATORS);
}

export async function readBacktestCache(): Promise<BacktestIndicatorCache | null> {
  const meta = await cacheGet<CacheMeta>(META_KEY);
  if (!meta?.snapshotId || !Array.isArray(meta.tickers)) return null;

  const keys = meta.tickers.map((ticker) => tickerKey(meta.snapshotId, ticker));
  const seriesList = await cacheMGet<TickerIndicatorSeries>(keys);
  if (seriesList.length !== keys.length || seriesList.some((series) => series === null)) return null;

  const tickers = seriesList as TickerIndicatorSeries[];
  if (tickers.some((series, index) => series.ticker !== meta.tickers[index])) return null;

  return { computedAt: meta.computedAt, ihsg: meta.ihsg, tickers };
}
