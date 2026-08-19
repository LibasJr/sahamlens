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

describe('GET /api/market-pulse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('public-read: guest tanpa session tetap menerima cache LensMarket', async () => {
    vi.mocked(cacheGet).mockResolvedValue({ indices: [], breadth: { total: 0 } } as any);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    const { meta, ...payload } = json;
    expect(payload).toEqual({ indices: [], breadth: { total: 0 } });
    // `meta.requestId` ADITIF dari runController (lihat shared/http/next-response.adapter.ts):
    // setiap respons membawa id yang sama dengan baris lognya. Diasersikan terpisah, bukan
    // dilonggarkan jadi toMatchObject - kalau amplop standar itu hilang, tes ini harus gagal.
    expect(meta.requestId).toEqual(expect.any(String));
    expect(res.headers.get('X-Request-Id')).toBe(meta.requestId);
    expect(getMarketPulse).not.toHaveBeenCalled();
  });

  it('cache miss tetap fallback compute agar LensMarket tidak kosong keras', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(getMarketPulse).mockResolvedValue({ indices: [{ name: 'IHSG' }] } as any);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.indices).toEqual([{ name: 'IHSG' }]);
    expect(cacheSet).toHaveBeenCalledTimes(1);
  });
});
