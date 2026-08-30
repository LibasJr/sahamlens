import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
}));
vi.mock('@/modules/fundamental', () => ({
  calculateIntrinsicValue: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  getOrCompute: vi.fn(),
}));
vi.mock('@/shared/security/api-rate-limit', () => ({
  checkPublicComputeBudget: vi.fn(),
}));

import { GET } from '../route';
import { calculateIntrinsicValue } from '@/modules/fundamental';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { getSession } from '@/modules/user';
import { checkPublicComputeBudget } from '@/shared/security/api-rate-limit';

function makeRequest(ticker: string): Request {
  return new Request(`http://localhost/api/intrinsic/${ticker}`);
}
function makeParams(ticker: string) {
  return { params: Promise.resolve({ ticker }) };
}

describe('GET /api/intrinsic/[ticker]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(checkPublicComputeBudget).mockResolvedValue({ allowed: true, degraded: false, unavailable: false });
  });

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

  it('tamu (guest) menerima angka nilai wajar tapi applied_rule dikosongkan', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(getOrCompute).mockResolvedValue({
      fair_value: 9500,
      harga: 8000,
      mos: 18.75,
      applied_rule: { dcf: 0.4, pbv: 0.6 },
    } as any);

    const res = await GET(makeRequest('BBCA'), makeParams('BBCA'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.fair_value).toBe(9500);
    expect(json.applied_rule).toEqual({});
    expect(json.is_guest_limited).toBe(true);
  });

  it('pengguna login menerima applied_rule penuh', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1', email: 'u1@sahamlens.id' } as any);
    vi.mocked(getOrCompute).mockResolvedValue({
      fair_value: 9500,
      harga: 8000,
      mos: 18.75,
      applied_rule: { dcf: 0.4, pbv: 0.6 },
    } as any);

    const res = await GET(makeRequest('BBCA'), makeParams('BBCA'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.fair_value).toBe(9500);
    expect(json.applied_rule).toEqual({ dcf: 0.4, pbv: 0.6 });
    expect(json.is_guest_limited).toBe(false);
  });

  it('data tidak ditemukan -> 404', async () => {
    vi.mocked(getOrCompute).mockImplementation(async (_key, _ttl, compute) => compute());
    vi.mocked(calculateIntrinsicValue).mockResolvedValue(null);

    const res = await GET(makeRequest('XXXX'), makeParams('XXXX'));

    expect(res.status).toBe(404);
  });
});
