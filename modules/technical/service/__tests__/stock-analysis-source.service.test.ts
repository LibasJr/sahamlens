import { afterEach, describe, expect, it } from 'vitest';
import {
  buildStaleStockAnalysisPayload,
  buildStockAnalysisCacheKeys,
  resolveStockAnalysisRange,
} from '../stock-analysis-source.service';

afterEach(() => {
  delete process.env.IDX_LQ45_EOD_PRIMARY_ENABLED;
});

describe('stock analysis source contract', () => {
  it('accepts only the bounded range allowlist and defaults unknown input to 20y', () => {
    expect(resolveStockAnalysisRange(new Request('https://sahamlens.id/api/stock/BBCA.JK?range=1y'))).toBe('1y');
    expect(resolveStockAnalysisRange(new Request('https://sahamlens.id/api/stock/BBCA.JK?range=7y'))).toBe('20y');
    expect(resolveStockAnalysisRange(new Request('https://sahamlens.id/api/stock/BBCA.JK'))).toBe('20y');
  });

  it('separates cache namespaces when the IDX LQ45 primary source is enabled', () => {
    process.env.IDX_LQ45_EOD_PRIMARY_ENABLED = 'false';
    const yahoo = buildStockAnalysisCacheKeys('BBCA.JK', '1y');
    process.env.IDX_LQ45_EOD_PRIMARY_ENABLED = 'true';
    const idx = buildStockAnalysisCacheKeys('BBCA.JK', '1y');

    expect(yahoo.cacheKey).toContain('yahoo-eod-v1:BBCA.JK:1y');
    expect(idx.cacheKey).toContain('idx-lq45-eod-v1:BBCA.JK:1y');
    expect(idx.cacheKey).not.toBe(yahoo.cacheKey);
    expect(idx.staleFallbackKey).not.toBe(yahoo.staleFallbackKey);
  });

  it('marks stale fallback explicitly without mutating the original cached payload', () => {
    const original = {
      stock: { symbol: 'BBCA.JK' },
      _meta: { source: 'live', computedAt: new Date(Date.now() - 3_600_000).toISOString() },
    };

    const fallback = buildStaleStockAnalysisPayload(original);

    expect(fallback).not.toBe(original);
    expect(fallback._meta.source).toBe('stale-cache');
    expect(fallback._meta.staleReason).toContain('Yahoo Finance fetch gagal');
    expect(fallback._meta.ageSeconds).toBeGreaterThanOrEqual(3_599);
    expect(original._meta.source).toBe('live');
  });
});
