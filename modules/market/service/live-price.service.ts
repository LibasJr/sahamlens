import { getMarketAwareCacheHeaders, getMarketAwareTtlSec } from '@/shared/cache/ttl-policy';
import { classifyFreshness } from '@/shared/http/freshness';
import { isProviderCircuitOpen, recordProviderFailure, recordProviderSuccess } from '@/shared/http/provider-circuit-breaker';
import { resolvePreviousClose } from '@/shared/market/previous-close';
import { recordDataSourceHealth } from '@/modules/observability/service/data-source-health.service';

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export interface LivePriceResult {
  available: boolean;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

/**
 * Fetch one IDX/Yahoo chart snapshot and derive previous-close/freshness from the same
 * source payload. Provider failure remains fail-closed: no fabricated or silent provider
 * fallback is returned from this service.
 */
export async function fetchLivePriceSnapshot(ticker: string): Promise<LivePriceResult> {
  const startedAt = Date.now();
  const yahooCircuitOpen = await isProviderCircuitOpen('YAHOO_CHART');
  try {
    if (yahooCircuitOpen) throw new Error('YAHOO_CIRCUIT_OPEN');

    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1mo&interval=1d`;
    const yahooRes = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: getMarketAwareTtlSec() },
    });

    if (yahooRes.ok) {
      await recordProviderSuccess('YAHOO_CHART');
      const data = await yahooRes.json();
      const result = data?.chart?.result?.[0];
      const meta = result?.meta;
      const lastPrice = meta?.regularMarketPrice;

      if (isFinitePositive(lastPrice)) {
        const resolved = resolvePreviousClose({
          timestamps: result?.timestamp,
          closes: result?.indicators?.quote?.[0]?.close,
          metaPreviousClose: meta?.previousClose,
          metaChartPreviousClose: meta?.chartPreviousClose,
        });
        const previousClose = resolved.previousClose;

        if (resolved.metaDisagrees) {
          console.warn(
            `[live:${ticker}] meta.previousClose=${resolved.metaValue} berbeda dari riwayat harian=${previousClose} - memakai riwayat`,
          );
        }

        const changePercent = previousClose != null ? ((lastPrice - previousClose) / previousClose) * 100 : null;
        const volume = isFiniteNonNegative(meta?.regularMarketVolume) ? meta.regularMarketVolume : null;
        const fresh = classifyFreshness(meta?.regularMarketTime);
        if (process.env.NODE_ENV !== 'test') await recordDataSourceHealth({
          sourceId: 'YAHOO_CHART', ok: true, latencyMs: Date.now() - startedAt,
          dataObservedAt: fresh.dataTimestamp,
          detail: { endpoint: 'live-price', freshness: fresh.freshness },
        });

        return {
          available: true,
          body: {
            price: lastPrice,
            changePercent: changePercent != null ? parseFloat(changePercent.toFixed(2)) : null,
            previousClose,
            volume,
            lastUpdate: fresh.dataTimestamp,
            dataTimestamp: fresh.dataTimestamp,
            ageSeconds: fresh.ageSeconds,
            freshness: fresh.freshness,
            source: 'Yahoo Finance',
            delay: null,
          },
          headers: getMarketAwareCacheHeaders(),
        };
      }
      console.warn(`Yahoo Finance returned no valid price for ${ticker}`);
    } else if (yahooRes.status === 429 || yahooRes.status === 403) {
      await recordProviderFailure('YAHOO_CHART', { immediateOpen: true });
      console.warn(`Yahoo Finance blocked (Status ${yahooRes.status}) for ${ticker}`);
    } else {
      await recordProviderFailure('YAHOO_CHART');
      console.warn(`Yahoo Finance error: ${yahooRes.statusText}`);
    }
  } catch (error) {
    if (!(error instanceof Error && error.message === 'YAHOO_CIRCUIT_OPEN')) {
      await recordProviderFailure('YAHOO_CHART');
    }
    console.error('Failed to fetch from Yahoo Finance:', error);
  }

  if (process.env.NODE_ENV !== 'test') await recordDataSourceHealth({
    sourceId: 'YAHOO_CHART', ok: false, latencyMs: Date.now() - startedAt,
    detail: { endpoint: 'live-price', ticker: ticker.replace(/\.JK$/i, '') },
  });

  return {
    available: false,
    body: {
      price: null,
      changePercent: null,
      volume: null,
      lastUpdate: null,
      dataTimestamp: null,
      ageSeconds: null,
      freshness: 'UNKNOWN',
      source: null,
      delay: null,
      error: 'Data harga tidak tersedia saat ini',
    },
  };
}
