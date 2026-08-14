import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/fundamental', () => ({
  calculateDcfModel: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  getOrCompute: vi.fn(),
}));

import { GET } from '../route';
import { calculateDcfModel } from '@/modules/fundamental';
import { getOrCompute } from '@/shared/cache/redis-cache';

function makeRequest(ticker: string): Request {
  return new Request(`http://localhost/api/dcf/${ticker}`);
}
function makeParams(ticker: string) {
  return { params: Promise.resolve({ ticker }) };
}

// BUG FIX (2026-08-14, audit "semua menu harus ada cache"): endpoint ini sebelumnya
// hanya mengandalkan header Cache-Control/CDN-Cache-Control (tidak berguna tanpa CDN
// di depan origin, dan production sudah tidak pakai Vercel CDN sejak 2026-08-13).
// Tes ini mengunci bahwa hitungan model DCF sekarang lewat getOrCompute.
describe('GET /api/dcf/[ticker]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('membaca lewat getOrCompute, kunci cache per ticker', async () => {
    vi.mocked(getOrCompute).mockImplementation(async (_key, _ttl, compute) => compute());
    vi.mocked(calculateDcfModel).mockResolvedValue({ fair_value: 9500 } as any);

    const res = await GET(makeRequest('BBCA'), makeParams('BBCA'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.fair_value).toBe(9500);
    expect(getOrCompute).toHaveBeenCalledWith(
      expect.stringContaining('sahamlens:cache:computed:dcf:'),
      expect.any(Number),
      expect.any(Function),
    );
  });

  it('cache hit tidak memanggil calculateDcfModel sama sekali', async () => {
    vi.mocked(getOrCompute).mockResolvedValue({ fair_value: 9500 } as any);

    const res = await GET(makeRequest('BBCA'), makeParams('BBCA'));

    expect(res.status).toBe(200);
    expect(calculateDcfModel).not.toHaveBeenCalled();
  });

  it('data tidak tersedia -> 404, hasil "not found" tetap dibungkus supaya bisa dicache', async () => {
    vi.mocked(getOrCompute).mockImplementation(async (_key, _ttl, compute) => compute());
    vi.mocked(calculateDcfModel).mockResolvedValue(null);

    const res = await GET(makeRequest('XXXX'), makeParams('XXXX'));

    expect(res.status).toBe(404);
  });
});
