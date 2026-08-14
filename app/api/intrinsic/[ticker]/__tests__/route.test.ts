import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/fundamental', () => ({
  calculateIntrinsicValue: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  getOrCompute: vi.fn(),
}));

import { GET } from '../route';
import { calculateIntrinsicValue } from '@/modules/fundamental';
import { getOrCompute } from '@/shared/cache/redis-cache';

function makeRequest(ticker: string): Request {
  return new Request(`http://localhost/api/intrinsic/${ticker}`);
}
function makeParams(ticker: string) {
  return { params: Promise.resolve({ ticker }) };
}

// BUG FIX (2026-08-14, audit "semua menu harus ada cache"): dipanggil dari
// components/IntrinsicValue.tsx di halaman /fundamental, sebelumnya TANPA cache
// sama sekali. Tes ini mengunci jalur baca sekarang lewat getOrCompute.
describe('GET /api/intrinsic/[ticker]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('membaca lewat getOrCompute, kunci cache per ticker', async () => {
    vi.mocked(getOrCompute).mockImplementation(async (_key, _ttl, compute) => compute());
    vi.mocked(calculateIntrinsicValue).mockResolvedValue({ fair_value: 9500, mos: 10 } as any);

    const res = await GET(makeRequest('BBCA'), makeParams('BBCA'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.fair_value).toBe(9500);
    expect(getOrCompute).toHaveBeenCalledWith(
      expect.stringContaining('sahamlens:cache:computed:intrinsic:'),
      expect.any(Number),
      expect.any(Function),
    );
  });

  it('cache hit tidak memanggil calculateIntrinsicValue sama sekali', async () => {
    vi.mocked(getOrCompute).mockResolvedValue({ fair_value: 9500 } as any);

    const res = await GET(makeRequest('BBCA'), makeParams('BBCA'));

    expect(res.status).toBe(200);
    expect(calculateIntrinsicValue).not.toHaveBeenCalled();
  });

  it('data tidak ditemukan -> 404', async () => {
    vi.mocked(getOrCompute).mockImplementation(async (_key, _ttl, compute) => compute());
    vi.mocked(calculateIntrinsicValue).mockResolvedValue(null);

    const res = await GET(makeRequest('XXXX'), makeParams('XXXX'));

    expect(res.status).toBe(404);
  });
});
