import YahooFinanceClass from 'yahoo-finance2';
import { COMPUTED_CACHE_VERSION } from '@/shared/cache/cache-version';
import {
  isProviderCircuitOpen,
  recordProviderFailure,
  recordProviderSuccess,
} from '@/shared/http/provider-circuit-breaker';
import { recordDegradedMode } from '@/shared/observability/request-context';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });
const ALLOWED_RANGES = new Set(['1mo', '3mo', '6mo', '1y', '3y', '5y', '20y']);

export function resolveStockAnalysisRange(request: Request): string {
  const requestUrl = new URL(request.url);
  const rangeParam = requestUrl.searchParams.get('range');
  return rangeParam && ALLOWED_RANGES.has(rangeParam) ? rangeParam : '20y';
}

export function buildStockAnalysisCacheKeys(ticker: string, range: string) {
  const providerCacheTag = process.env.IDX_LQ45_EOD_PRIMARY_ENABLED === 'true'
    ? 'idx-lq45-eod-v1'
    : 'yahoo-eod-v1';

  return {
    cacheKey: `sahamlens:cache:computed:technical:${COMPUTED_CACHE_VERSION}:${providerCacheTag}:${ticker}:${range}`,
    staleFallbackKey: `sahamlens:cache:computed:technical-stale-fallback:${COMPUTED_CACHE_VERSION}:${providerCacheTag}:${ticker}:${range}`,
  };
}

export async function fetchStockAnalysisSource(ticker: string, range: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=1d`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  const yahooCircuitOpen = await isProviderCircuitOpen('YAHOO_CHART');
  if (yahooCircuitOpen) clearTimeout(timeoutId);

  const chartPromise = yahooCircuitOpen
    ? Promise.reject(new Error('YAHOO_CIRCUIT_OPEN'))
    : fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: controller.signal,
      })
        .then(async (res) => {
          clearTimeout(timeoutId);
          if (!res.ok) {
            await recordProviderFailure('YAHOO_CHART', {
              immediateOpen: res.status === 403 || res.status === 429,
            });
            throw new Error(`Failed to fetch Yahoo data: ${res.status}`);
          }
          await recordProviderSuccess('YAHOO_CHART');
          return res.json();
        })
        .catch(async (error: any) => {
          clearTimeout(timeoutId);
          if (!(error instanceof Error && error.message === 'YAHOO_CIRCUIT_OPEN')) {
            await recordProviderFailure('YAHOO_CHART');
          }
          throw error;
        });

  const quotePromise = yahooCircuitOpen
    ? Promise.resolve(null)
    : Promise.race([
        yahooFinance.quoteSummary(ticker, {
          // assetProfile is required by sector-aware scoring. Keep it explicit so
          // production scoring cannot silently fall back to UNCLASSIFIED.
          modules: ['assetProfile', 'defaultKeyStatistics', 'financialData', 'summaryDetail', 'price'],
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('quoteSummary timeout')), 8000)),
      ]).catch((error: any) => {
        console.warn('Failed to fetch fundamental data for scoring:', error);
        return null;
      });

  const [data, quoteSummary] = await Promise.all([chartPromise, quotePromise]);
  return { data, quoteSummary };
}

export function buildStaleStockAnalysisPayload(stale: any) {
  recordDegradedMode('technical-stale-cache-fallback');
  const staleComputedAt = stale?._meta?.computedAt;
  return {
    ...stale,
    _meta: {
      ...(stale?._meta || {}),
      source: 'stale-cache',
      staleReason: 'Yahoo Finance fetch gagal - menyajikan data terakhir yang berhasil diambil',
      ageSeconds: staleComputedAt
        ? Math.round((Date.now() - new Date(staleComputedAt).getTime()) / 1000)
        : null,
    },
  };
}
