import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/market', () => ({
  getMarketPulse: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

import { GET } from '../route';
import { getMarketPulse } from '@/modules/market';
import { cacheGet, cacheSet } from '@/shared/cache/redis-cache';

// Route handler Next menerima Request wajib (bukan opsional) - itu kontrak yang
// diperiksa saat `next build` membangkitkan tipe route.
function makeRequest(): Request {
  return new Request('http://localhost/api/market-pulse');
}

describe('GET /api/market-pulse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('public-read: guest tanpa session tetap menerima cache LensMarket', async () => {
    vi.mocked(cacheGet).mockResolvedValue({ indices: [], breadth: { total: 0 } } as any);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      indices: [],
      breadth: { total: 0 },
      meta: { requestId: expect.any(String) },
    });
    expect(getMarketPulse).not.toHaveBeenCalled();
  });

  it('cache miss tetap fallback compute agar LensMarket tidak kosong keras', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(getMarketPulse).mockResolvedValue({ indices: [{ name: 'IHSG' }] } as any);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.indices).toEqual([{ name: 'IHSG' }]);
    expect(cacheSet).toHaveBeenCalledTimes(1);
  });
});
