import { fetchYahooHistory, type YahooHistoryResult } from '@/modules/technical';
import { createBoundedLoader } from '@/shared/async/bounded-loader';

export type CalibrationYahooRange = '5y';

/**
 * Calibration is deliberately throttled harder than normal single-stock UI calls.
 *
 * Production Sentry showed a burst of many 5y Yahoo calls in ~2 seconds when
 * /api/admin/calibration was opened. That is unnecessary pressure on Yahoo,
 * Vercel memory/network, and the long-running calibration request.
 *
 * This cache is warm-instance memory only. It is NOT authoritative storage and
 * does not change PIT semantics or any statistical calculation.
 */
const calibrationYahooLoader = createBoundedLoader<
  { ticker: string; range: CalibrationYahooRange },
  YahooHistoryResult | null
>(
  async ({ ticker, range }) => {
    try {
      return await fetchYahooHistory(ticker, range);
    } catch (error) {
      // One ticker failing must not become an unhandled rejection.
      // Caller still receives null and must remain fail-closed for that observation.
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
    // Avoid 80-100 simultaneous Yahoo requests. Six is intentionally conservative.
    concurrency: 6,

    // Calibration data is daily; a 10-minute warm-cache does not alter historical bars.
    ttlMs: 10 * 60 * 1000,

    // Individual ticker failure should not stall the whole route indefinitely.
    timeoutMs: 12_000,

    // Coverage universe is ~100 stocks; room for multiple ranges if added later.
    maxEntries: 256,
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
