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
vi.mock('@/modules/validation', () => ({
  getLensScoreValidationStatus: vi.fn(() => ({
    validated: false,
    reasonCode: 'MODEL_UNVALIDATED',
    message: 'LensScore belum tervalidasi.',
  })),
}));

import { handleGetStockAnalysis } from '../stock-analysis.controller';

const context = {
  ticker: 'BBCA.JK',
  isInternal: false,
  session: { id: 'user-1' },
  hasPro: false,
};
const request = () => new Request('https://sahamlens.id/api/stock/BBCA.JK?range=1y');
const dataQuality = {
  contractVersion: 'stock-analysis-contract-v1.0.0',
  source: 'YAHOO_CHART',
  lastUpdated: '2026-08-27T02:00:00.000Z',
  calculatedAt: '2026-08-27T02:01:00.000Z',
  freshness: 'DELAYED',
  staleReason: null,
  noDummyPolicy: {
    mode: 'FAIL_CLOSED',
    missingNumericValues: 'NULL_NOT_ZERO',
    missingLabels: 'NULL_NOT_SYNTHETIC_LABEL',
  },
  criticalGaps: [],
};

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

  it('serves a fresh shared cache entry, preserves legacy fields, and adds the API envelope', async () => {
    const cached = {
      stock: { symbol: 'BBCA.JK' },
      scoring: { total_score: 71 },
      _meta: {
        dataTimestamp: '2026-08-27T02:00:00.000Z',
        computedAt: '2026-08-27T02:01:00.000Z',
        freshness: 'DELAYED',
        lensScoreModel: { version: 'lens-score-v1' },
      },
    };
    mocks.cacheGet.mockResolvedValueOnce(cached);

    const result = await handleGetStockAnalysis(request(), 'BBCA.JK');
    const body = result.body as any;

    expect(mocks.cacheGet).toHaveBeenCalledWith('fresh-key');
    expect(mocks.attachQuota).toHaveBeenCalledWith(cached, context);
    expect(mocks.fetchSource).not.toHaveBeenCalled();
    expect(result.status).toBe(200);
    expect(body.stock.symbol).toBe('BBCA.JK');
    expect(body._quota.remaining).toBe(2);
    expect(body.ok).toBe(true);
    expect(body.modelValidation).toEqual({
      validated: false,
      reasonCode: 'MODEL_UNVALIDATED',
      message: 'LensScore belum tervalidasi.',
    });
    expect(body.data.stock.symbol).toBe('BBCA.JK');
    expect(body.data._quota.remaining).toBe(2);
    expect(body.data.modelValidation).toEqual(body.modelValidation);
    expect(body.meta).toEqual(expect.objectContaining({
      source: 'technical-analysis-cache',
      dataAsOf: '2026-08-27T02:00:00.000Z',
      calculatedAt: '2026-08-27T02:01:00.000Z',
      staleness: 'delayed',
      modelVersion: 'lens-score-v1',
    }));
  });

  it('falls back to stale computed data and marks the envelope stale', async () => {
    const stale = { stock: { symbol: 'BBCA.JK' }, _meta: { computedAt: '2026-08-19T00:00:00.000Z' } };
    const stalePayload = { ...stale, _meta: { ...stale._meta, source: 'stale-cache' } };
    mocks.cacheGet.mockResolvedValueOnce(null).mockResolvedValueOnce(stale);
    mocks.fetchSource.mockRejectedValue(new Error('provider down'));
    mocks.buildStale.mockReturnValue(stalePayload);

    const result = await handleGetStockAnalysis(request(), 'BBCA.JK');
    const body = result.body as any;

    expect(mocks.cacheGet).toHaveBeenNthCalledWith(1, 'fresh-key');
    expect(mocks.cacheGet).toHaveBeenNthCalledWith(2, 'stale-key');
    expect(mocks.buildStale).toHaveBeenCalledWith(stale);
    expect(mocks.compute).not.toHaveBeenCalled();
    expect(result.status).toBe(200);
    expect(body._meta.source).toBe('stale-cache');
    expect(body.ok).toBe(true);
    expect(body.modelValidation.reasonCode).toBe('MODEL_UNVALIDATED');
    expect(body.data._meta.source).toBe('stale-cache');
    expect(body.data.modelValidation).toEqual(body.modelValidation);
    expect(body.meta).toEqual(expect.objectContaining({
      source: 'technical-analysis-stale-cache',
      staleness: 'stale',
      calculatedAt: '2026-08-19T00:00:00.000Z',
    }));
  });

  it('caches only the domain payload, then attaches quota and envelope to the response copy', async () => {
    const computedPayload = {
      stock: { symbol: 'BBCA.JK' },
      scoring: { total_score: 77 },
      price: 9000,
      dataQuality,
      _meta: {
        computedAt: '2026-08-27T02:01:00.000Z',
        freshness: 'DELAYED',
        dataQuality,
      },
    };
    mocks.cacheGet.mockResolvedValueOnce(null);
    mocks.fetchSource.mockResolvedValue({ data: { chart: {} }, quoteSummary: { price: {} } });
    mocks.compute.mockResolvedValue({ status: 200, body: computedPayload });

    const result = await handleGetStockAnalysis(request(), 'BBCA.JK');
    const body = result.body as any;

    expect(mocks.compute).toHaveBeenCalledWith('BBCA.JK', '1y', { chart: {} }, { price: {} });
    expect(mocks.cacheSet).toHaveBeenCalledTimes(2);
    expect(mocks.cacheSet).toHaveBeenCalledWith('fresh-key', computedPayload, 300);
    expect(mocks.cacheSet).toHaveBeenCalledWith('stale-key', computedPayload, 86_400);
    expect(mocks.attachQuota).toHaveBeenCalledWith(computedPayload, context);
    expect(body._quota.remaining).toBe(2);
    expect(body.ok).toBe(true);
    expect(body.modelValidation.reasonCode).toBe('MODEL_UNVALIDATED');
    expect(body.data._quota.remaining).toBe(2);
    expect(body.data.modelValidation).toEqual(body.modelValidation);
    expect(body.meta).toEqual(expect.objectContaining({
      source: 'technical-analysis-live',
      calculatedAt: '2026-08-27T02:01:00.000Z',
      staleness: 'delayed',
    }));
    // Envelope/quota must never leak into the shared cache payload.
    expect(computedPayload).not.toHaveProperty('ok');
    expect(computedPayload).not.toHaveProperty('data');
    expect(computedPayload).not.toHaveProperty('_quota');
  });

  it('rejects computed success payloads that miss the no-dummy contract', async () => {
    const computedPayload = {
      stock: { symbol: 'BBCA.JK' },
      scoring: { total_score: 77 },
      price: 9000,
      _meta: { computedAt: '2026-08-27T02:01:00.000Z', freshness: 'DELAYED' },
    };
    mocks.cacheGet.mockResolvedValueOnce(null);
    mocks.fetchSource.mockResolvedValue({ data: { chart: {} }, quoteSummary: { price: {} } });
    mocks.compute.mockResolvedValue({ status: 200, body: computedPayload });

    const result = await handleGetStockAnalysis(request(), 'BBCA.JK');

    expect(result).toEqual({
      status: 503,
      body: {
        error: 'Data saham tidak memenuhi kontrak no-dummy',
        code: 'NO_DUMMY_CONTRACT_MISSING',
      },
    });
    expect(mocks.cacheSet).not.toHaveBeenCalled();
    expect(mocks.attachQuota).not.toHaveBeenCalled();
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