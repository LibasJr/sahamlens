import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  resolveAccess: vi.fn(),
  attachQuota: vi.fn(),
  resolveRange: vi.fn(),
  buildKeys: vi.fn(),
  fetchSource: vi.fn(),
  buildStale: vi.fn(),
  compute: vi.fn(),
}));

vi.mock('@/shared/cache/redis-cache', () => ({
  cacheGet: mocks.cacheGet,
  cacheSet: mocks.cacheSet,
}));
vi.mock('@/shared/cache/ttl-policy', () => ({
  CACHE_TTL_SEC: { TECHNICAL: 300, STALE_FALLBACK: 86_400 },
}));
vi.mock('@/modules/technical/service/stock-analysis-access.service', () => ({
  resolveStockAnalysisAccess: mocks.resolveAccess,
  attachStockAnalysisQuota: mocks.attachQuota,
}));
vi.mock('@/modules/technical/service/stock-analysis-source.service', () => ({
  resolveStockAnalysisRange: mocks.resolveRange,
  buildStockAnalysisCacheKeys: mocks.buildKeys,
  fetchStockAnalysisSource: mocks.fetchSource,
  buildStaleStockAnalysisPayload: mocks.buildStale,
}));
vi.mock('@/modules/technical/service/stock-analysis-compute.service', () => ({
  computeStockAnalysisPayload: mocks.compute,
}));

import { handleGetStockAnalysis } from '../stock-analysis.controller';

const context = {
  ticker: 'BBCA.JK',
  isInternal: false,
  session: { id: 'user-1' },
  hasPro: false,
};
const request = () => new Request('https://sahamlens.id/api/stock/BBCA.JK?range=1y');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAccess.mockResolvedValue({ ok: true, context });
  mocks.resolveRange.mockReturnValue('1y');
  mocks.buildKeys.mockReturnValue({ cacheKey: 'fresh-key', staleFallbackKey: 'stale-key' });
  mocks.attachQuota.mockImplementation(async (payload) => ({ ...payload, _quota: { remaining: 2 } }));
  mocks.cacheSet.mockResolvedValue(undefined);
});

describe('handleGetStockAnalysis contract', () => {
  it('returns an access rejection without touching cache or providers', async () => {
    mocks.resolveAccess.mockResolvedValue({
      ok: false,
      response: { status: 400, body: { error: 'Ticker tidak valid' } },
    });

    const result = await handleGetStockAnalysis(request(), 'INVALID!');

    expect(result).toEqual({ status: 400, body: { error: 'Ticker tidak valid' } });
    expect(mocks.cacheGet).not.toHaveBeenCalled();
    expect(mocks.fetchSource).not.toHaveBeenCalled();
  });

  it('serves a fresh shared cache entry and attaches user quota after the cache read', async () => {
    const cached = { stock: { symbol: 'BBCA.JK' }, scoring: { total_score: 71 } };
    mocks.cacheGet.mockResolvedValueOnce(cached);

    const result = await handleGetStockAnalysis(request(), 'BBCA.JK');

    expect(mocks.cacheGet).toHaveBeenCalledWith('fresh-key');
    expect(mocks.attachQuota).toHaveBeenCalledWith(cached, context);
    expect(mocks.fetchSource).not.toHaveBeenCalled();
    expect(result.status).toBe(200);
    expect((result.body as any)._quota.remaining).toBe(2);
  });

  it('falls back to stale computed data when the provider fails, preserving stale metadata', async () => {
    const stale = { stock: { symbol: 'BBCA.JK' }, _meta: { computedAt: '2026-08-19T00:00:00.000Z' } };
    const stalePayload = { ...stale, _meta: { ...stale._meta, source: 'stale-cache' } };
    mocks.cacheGet.mockResolvedValueOnce(null).mockResolvedValueOnce(stale);
    mocks.fetchSource.mockRejectedValue(new Error('provider down'));
    mocks.buildStale.mockReturnValue(stalePayload);

    const result = await handleGetStockAnalysis(request(), 'BBCA.JK');

    expect(mocks.cacheGet).toHaveBeenNthCalledWith(1, 'fresh-key');
    expect(mocks.cacheGet).toHaveBeenNthCalledWith(2, 'stale-key');
    expect(mocks.buildStale).toHaveBeenCalledWith(stale);
    expect(mocks.compute).not.toHaveBeenCalled();
    expect(result.status).toBe(200);
    expect((result.body as any)._meta.source).toBe('stale-cache');
  });

  it('caches only successful computed payloads, then attaches quota to the response copy', async () => {
    const computedPayload = { stock: { symbol: 'BBCA.JK' }, scoring: { total_score: 77 } };
    mocks.cacheGet.mockResolvedValueOnce(null);
    mocks.fetchSource.mockResolvedValue({ data: { chart: {} }, quoteSummary: { price: {} } });
    mocks.compute.mockResolvedValue({ status: 200, body: computedPayload });

    const result = await handleGetStockAnalysis(request(), 'BBCA.JK');

    expect(mocks.compute).toHaveBeenCalledWith('BBCA.JK', '1y', { chart: {} }, { price: {} });
    expect(mocks.cacheSet).toHaveBeenCalledTimes(2);
    expect(mocks.cacheSet).toHaveBeenCalledWith('fresh-key', computedPayload, 300);
    expect(mocks.cacheSet).toHaveBeenCalledWith('stale-key', computedPayload, 86_400);
    expect(mocks.attachQuota).toHaveBeenCalledWith(computedPayload, context);
    expect((result.body as any)._quota.remaining).toBe(2);
  });

  it('does not cache domain failures returned by the compute pipeline', async () => {
    mocks.cacheGet.mockResolvedValueOnce(null);
    mocks.fetchSource.mockResolvedValue({ data: { chart: {} }, quoteSummary: null });
    mocks.compute.mockResolvedValue({ status: 503, body: { error: 'Harga pasar tidak tersedia' } });

    const result = await handleGetStockAnalysis(request(), 'BBCA.JK');

    expect(result).toEqual({ status: 503, body: { error: 'Harga pasar tidak tersedia' } });
    expect(mocks.cacheSet).not.toHaveBeenCalled();
    expect(mocks.attachQuota).not.toHaveBeenCalled();
  });
});
