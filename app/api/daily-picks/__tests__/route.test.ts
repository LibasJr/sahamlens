import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/market', () => ({
  getMarketSummary: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  getOrCompute: vi.fn((key: string, ttl: number, compute: () => Promise<unknown>) => compute()),
  cacheGet: vi.fn(),
}));

import { GET } from '../route';
import { getMarketSummary } from '@/modules/market';
import { cacheGet } from '@/shared/cache/redis-cache';

const stock = { symbol: 'BBCA.JK', price: 9000, changePct: 1.2, score: 82 };

function summary() {
  return {
    topTechnical: [stock],
    topWeeklyGainers: [stock],
    topRelativeStrength: [{ ...stock, relativeStrength5D: 2.5 }],
    topTechnicalBearish: [stock],
    topRsiOversold: [{ ...stock, rsi: 25 }],
    topForeignAccumulation: [{ ...stock, streak: 3 }],
    timestamp: '2026-08-27T01:00:00.000Z',
  };
}

describe('GET /api/daily-picks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMarketSummary).mockResolvedValue(summary() as any);
    vi.mocked(cacheGet).mockResolvedValue({
      data: [{ symbol: 'BBCA.JK', price: 9000, change: '1.2', score: 88, rr: '2.0' }],
      crossSignals: { golden: [], dead: [] },
      lastUpdate: '2026-08-27T00:59:00.000Z',
    });
  });

  it('mengembalikan envelope standar tanpa memutus field lama', async () => {
    const res = await GET(new Request('http://localhost/api/daily-picks'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.attractive.items).toEqual(['BBCA']);
    expect(json.attractive.items).toEqual(['BBCA']);
    expect(json.meta).toEqual(expect.objectContaining({
      requestId: expect.any(String),
      dataAsOf: '2026-08-27T00:59:00.000Z',
      calculatedAt: '2026-08-27T01:00:00.000Z',
      source: 'market-summary + breakout-radar-cache',
      modelVersion: 'LENS_RADAR_DAILY_PICKS',
    }));
  });
});
