import type { HttpResult } from '@/shared/types/http-result.types';
import { cacheGet, cacheSet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC as TTL } from '@/shared/cache/ttl-policy';
import {
  attachStockAnalysisQuota,
  resolveStockAnalysisAccess,
} from '@/modules/technical/service/stock-analysis-access.service';
import {
  buildStaleStockAnalysisPayload,
  buildStockAnalysisCacheKeys,
  fetchStockAnalysisSource,
  resolveStockAnalysisRange,
} from '@/modules/technical/service/stock-analysis-source.service';
import { computeStockAnalysisPayload } from '@/modules/technical/service/stock-analysis-compute.service';

/**
 * Thin HTTP-facing orchestrator for stock analysis.
 *
 * Responsibilities are deliberately limited to request policy, cache orchestration and
 * mapping service results into HttpResult. Provider access, flow analysis and scoring
 * live in dedicated application services so they can evolve independently.
 */
export async function handleGetStockAnalysis(
  request: Request,
  rawTicker: string,
): Promise<HttpResult> {
  try {
    const access = await resolveStockAnalysisAccess(request, rawTicker);
    if (!access.ok) return access.response;

    const { context } = access;
    const range = resolveStockAnalysisRange(request);
    const { cacheKey, staleFallbackKey } = buildStockAnalysisCacheKeys(context.ticker, range);

    const cached = await cacheGet<any>(cacheKey);
    if (cached) {
      return {
        status: 200,
        body: await attachStockAnalysisQuota(cached, context),
      };
    }

    let source;
    try {
      source = await fetchStockAnalysisSource(context.ticker, range);
    } catch (error) {
      const stale = await cacheGet<any>(staleFallbackKey);
      if (stale) {
        console.warn(`Yahoo fetch failed, returning stale fallback cache for ${context.ticker}`);
        return {
          status: 200,
          body: await attachStockAnalysisQuota(buildStaleStockAnalysisPayload(stale), context),
        };
      }

      console.error('Stock source fetch error:', error);
      return { status: 500, body: { error: 'Failed to fetch Yahoo data' } };
    }

    const computed = await computeStockAnalysisPayload(
      context.ticker,
      range,
      source.data,
      source.quoteSummary,
    );
    if (computed.status !== 200) return computed;

    await Promise.all([
      cacheSet(cacheKey, computed.body, TTL.TECHNICAL),
      cacheSet(staleFallbackKey, computed.body, TTL.STALE_FALLBACK),
    ]);

    return {
      status: 200,
      body: await attachStockAnalysisQuota(computed.body, context),
    };
  } catch (error) {
    console.error('Stock API error:', error);
    return { status: 500, body: { error: 'Internal Server Error' } };
  }
}
