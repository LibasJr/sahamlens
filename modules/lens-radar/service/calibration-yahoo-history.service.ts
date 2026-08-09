import { fetchYahooHistory, type YahooHistoryResult } from '@/modules/technical';
import { createBoundedLoader } from '@/shared/async/bounded-loader';

export type CalibrationYahooRange = '5y';

/**
 * Calibration is deliberately throttled harder than normal single-stock UI calls.
 * Cache is warm-instance memory only and never becomes a source of truth.
 */
const calibrationYahooLoader = createBoundedLoader<
  { ticker: string; range: CalibrationYahooRange },
  YahooHistoryResult | null
>(
  async ({ ticker, range }) => {
    try {
      return await fetchYahooHistory(ticker, range);
    } catch (error) {
      console.warn('[calibration.yahoo] ticker fetch failed', {
        ticker,
        range,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },
  ({ ticker, range }) => `${ticker.trim().toUpperCase()}|${range}`,
  {
    concurrency: 6,
    ttlMs: 10 * 60 * 1000,
    timeoutMs: 12_000,
    maxEntries: 256,
    shouldCache: (value) => value !== null,
  },
);

export async function fetchCalibrationYahooHistory5y(
  ticker: string,
): Promise<YahooHistoryResult | null> {
  return calibrationYahooLoader.get({
    ticker: ticker.trim().toUpperCase(),
    range: '5y',
  });
}

export function calibrationYahooLoaderStats() {
  return calibrationYahooLoader.stats();
}
