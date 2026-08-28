import type { HttpResult } from '@/shared/types/http-result.types';
import { cacheGet, cacheSet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC as TTL } from '@/shared/cache/ttl-policy';
import { apiOk, type ApiResponseMeta } from '@/shared/http/api-response';
import { logger } from '@/shared/logger/logger';
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
import { validateNoDummyStockPayload } from '@/modules/technical/service/stock-analysis-contract.service';
import { getLensScoreValidationStatus } from '@/modules/validation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stockResponseMeta(
  payload: Record<string, unknown>,
  source: string,
  staleness?: string,
): Omit<ApiResponseMeta, 'requestId'> {
  const legacyMeta = isRecord(payload._meta) ? payload._meta : {};
  return {
    source,
    dataAsOf: typeof legacyMeta.dataTimestamp === 'string' ? legacyMeta.dataTimestamp : undefined,
    lastUpdated: typeof legacyMeta.lastUpdated === 'string'
      ? legacyMeta.lastUpdated
      : typeof legacyMeta.dataTimestamp === 'string' ? legacyMeta.dataTimestamp : undefined,
    calculatedAt: typeof legacyMeta.computedAt === 'string' ? legacyMeta.computedAt : undefined,
    staleness: staleness ?? (typeof legacyMeta.freshness === 'string' ? legacyMeta.freshness.toLowerCase() : undefined),
    staleReason: typeof legacyMeta.staleReason === 'string' ? legacyMeta.staleReason : null,
    modelVersion: isRecord(legacyMeta.lensScoreModel) && typeof legacyMeta.lensScoreModel.version === 'string'
      ? legacyMeta.lensScoreModel.version
      : undefined,
  };
}

function withStockEnvelope<T extends Record<string, unknown>>(
  payload: T,
  meta: Omit<ApiResponseMeta, 'requestId'>,
) {
  const modelValidation = getLensScoreValidationStatus();
  const data = { ...payload, modelValidation };
  return {
    ...payload,
    modelValidation,
    ...apiOk(data, {
      ...meta,
      modelVersion: meta.modelVersion ?? modelValidation.reasonCode,
    }),
  };
}

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

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      const payload = await attachStockAnalysisQuota(cached, context);
      return {
        status: 200,
        body: withStockEnvelope(payload, stockResponseMeta(payload, 'technical-analysis-cache')),
      };
    }

    let source;
    try {
      source = await fetchStockAnalysisSource(context.ticker, range);
    } catch (error) {
      const stale = await cacheGet<Record<string, unknown>>(staleFallbackKey);
      if (stale) {
        logger.warn('Stock source fetch failed; serving stale fallback cache', {
          module: 'stock-analysis',
          ticker: context.ticker,
          range,
          err: error instanceof Error ? error.message : String(error),
        });
        const payload = await attachStockAnalysisQuota(buildStaleStockAnalysisPayload(stale), context);
        return {
          status: 200,
          body: withStockEnvelope(payload, stockResponseMeta(payload, 'technical-analysis-stale-cache', 'stale')),
        };
      }

      logger.error('Stock source fetch failed without stale fallback', {
        module: 'stock-analysis',
        ticker: context.ticker,
        range,
        err: error,
      });
      return { status: 500, body: { error: 'Failed to fetch Yahoo data' } };
    }

    const computed = await computeStockAnalysisPayload(
      context.ticker,
      range,
      source.data,
      source.quoteSummary,
    );
    if (computed.status !== 200) return computed;
    if (!isRecord(computed.body)) {
      logger.error('Stock analysis produced a non-object success payload', {
        module: 'stock-analysis',
        ticker: context.ticker,
        range,
      });
      return { status: 500, body: { error: 'Internal Server Error' } };
    }

    const noDummy = validateNoDummyStockPayload(computed.body);
    if (!noDummy.ok) {
      logger.error('Stock analysis payload rejected by no-dummy contract', {
        module: 'stock-analysis',
        ticker: context.ticker,
        range,
        reason: noDummy.reason,
      });
      return {
        status: 503,
        body: {
          error: 'Data saham tidak memenuhi kontrak no-dummy',
          code: noDummy.reason,
        },
      };
    }

    // Cache only the domain payload. HTTP envelope and user-specific quota are attached
    // after the cache boundary so shared cache entries stay transport/user agnostic.
    await Promise.all([
      cacheSet(cacheKey, computed.body, TTL.TECHNICAL),
      cacheSet(staleFallbackKey, computed.body, TTL.STALE_FALLBACK),
    ]);

    const payload = await attachStockAnalysisQuota(computed.body, context);
    return {
      status: 200,
      body: withStockEnvelope(payload, stockResponseMeta(payload, 'technical-analysis-live')),
    };
  } catch (error) {
    logger.error('Stock API error', { module: 'stock-analysis', err: error });
    return { status: 500, body: { error: 'Internal Server Error' } };
  }
}