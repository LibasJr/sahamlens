import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/market', () => ({
  getMarketPulse: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  cacheGet: vi.fn(),
}));

import { GET } from '../route';
import { getMarketPulse } from '@/modules/market';
import { cacheGet } from '@/shared/cache/redis-cache';

describe('GET /api/market-pulse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('public-read: guest tanpa session tetap menerima cache LensMarket', async () => {
    vi.mocked(cacheGet).mockResolvedValue({ indices: [], breadth: { total: 0 } } as any);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ indices: [], breadth: { total: 0 } });
    expect(getMarketPulse).not.toHaveBeenCalled();
  });

  it('cache miss tetap fallback compute agar LensMarket tidak kosong keras', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(getMarketPulse).mockResolvedValue({ indices: [{ name: 'IHSG' }] } as any);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.indices).toEqual([{ name: 'IHSG' }]);
  });
});
