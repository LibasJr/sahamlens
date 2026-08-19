import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/cache/redis-cache', () => ({
  cacheGet: vi.fn(),
}));

import { GET } from '../route';
import { cacheGet } from '@/shared/cache/redis-cache';

// Route handler Next menerima Request wajib (bukan opsional) - itu kontrak yang
// diperiksa saat `next build` membangkitkan tipe route.
function makeRequest(): Request {
  return new Request('http://localhost/api/breakout-radar');
}

describe('GET /api/breakout-radar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('public-read: guest tanpa session tetap menerima cache breakout', async () => {
    vi.mocked(cacheGet).mockResolvedValue({ data: [{ symbol: 'BBCA.JK' }], crossSignals: { golden: [], dead: [] }, lastUpdate: '2026-08-10T00:00:00.000Z' } as any);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([{ symbol: 'BBCA.JK' }]);
  });

  it('cache miss tidak menjalankan scan mahal dan mengembalikan empty state eksplisit', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      data: [],
      crossSignals: { golden: [], dead: [] },
      lastUpdate: null,
      meta: { requestId: expect.any(String) },
    });
  });
});
