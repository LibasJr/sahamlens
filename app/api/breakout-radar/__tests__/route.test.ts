import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/cache/redis-cache', () => ({
  cacheGet: vi.fn(),
}));

import { GET } from '../route';
import { cacheGet } from '@/shared/cache/redis-cache';

describe('GET /api/breakout-radar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('public-read: guest tanpa session tetap menerima cache breakout', async () => {
    vi.mocked(cacheGet).mockResolvedValue({ data: [{ symbol: 'BBCA.JK' }], crossSignals: { golden: [], dead: [] }, lastUpdate: '2026-08-10T00:00:00.000Z' } as any);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([{ symbol: 'BBCA.JK' }]);
  });

  it('cache miss tidak menjalankan scan mahal dan mengembalikan empty state eksplisit', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ data: [], crossSignals: { golden: [], dead: [] }, lastUpdate: null });
  });
});
