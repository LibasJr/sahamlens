import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
}));
vi.mock('@/modules/market/service/screener.service', () => ({
  fetchScreenerUniverse: vi.fn(),
  rankScreener: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  getOrCompute: vi.fn(),
  getCacheTtlRemaining: vi.fn(),
}));
vi.mock('@/shared/middleware/compute-budget', () => ({
  computeActorFromRequest: vi.fn(() => 'ip:unknown'),
  consumeComputeBudget: vi.fn(async () => ({ allowed: true, used: 1, limit: 5, remaining: 4 })),
}));

import { GET } from '../route';
import { rankScreener } from '@/modules/market/service/screener.service';
import { getOrCompute, getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { getSession } from '@/modules/user';

function makeRequest(qs = ''): Request {
  return new Request(`http://localhost/api/screener${qs}`);
}

const universe = [
  { ticker: 'BBCA', sector: 'Keuangan' },
  { ticker: 'TLKM', sector: 'Infrastruktur' },
];

const mockTop10 = [
  { ticker: 'BBCA', score: 90 },
  { ticker: 'BBRI', score: 85 },
  { ticker: 'BMRI', score: 80 },
  { ticker: 'BBNI', score: 75 },
  { ticker: 'TLKM', score: 70 },
  { ticker: 'ASII', score: 65 },
  { ticker: 'ICBP', score: 60 },
  { ticker: 'INDF', score: 55 },
  { ticker: 'UNVR', score: 50 },
  { ticker: 'KLBF', score: 45 },
];

describe('GET /api/screener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(getOrCompute).mockResolvedValue(universe as any);
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(null);
    vi.mocked(rankScreener).mockReturnValue(mockTop10 as any);
  });

  it('meneruskan sector, maxPrice, minMarketCap, minLiquidity dari query string ke rankScreener', async () => {
    const res = await GET(makeRequest('?profile=Moderat&sector=Keuangan&maxPrice=5000&minMarketCap=100000000000000&minLiquidity=1000000000'));

    expect(res.status).toBe(200);
    expect(rankScreener).toHaveBeenCalledWith(universe, 'Moderat', {
      sector: 'Keuangan', maxPrice: 5000, minMarketCap: 100_000_000_000_000, minLiquidity: 1_000_000_000,
    });
  });

  it('tanpa query filter, semua filter diteruskan undefined', async () => {
    await GET(makeRequest('?profile=Moderat'));

    expect(rankScreener).toHaveBeenCalledWith(universe, 'Moderat', {
      sector: undefined, maxPrice: undefined, minMarketCap: undefined, minLiquidity: undefined,
    });
  });

  it('maxPrice/minMarketCap/minLiquidity bukan angka positif diabaikan (diteruskan undefined)', async () => {
    await GET(makeRequest('?profile=Moderat&maxPrice=-100&minMarketCap=abc&minLiquidity=0'));

    expect(rankScreener).toHaveBeenCalledWith(universe, 'Moderat', {
      sector: undefined, maxPrice: undefined, minMarketCap: undefined, minLiquidity: undefined,
    });
  });

  it('availableSectors berasal dari universe PENUH, diurutkan alfabet', async () => {
    const res = await GET(makeRequest('?profile=Moderat&sector=Keuangan'));
    const json = await res.json();

    expect(json.availableSectors).toEqual(['Infrastruktur', 'Keuangan']);
  });

  it('tamu (guest/unauthenticated) hanya menerima 2 emiten teratas dengan flag is_guest_limited', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await GET(makeRequest('?profile=Moderat'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.analysis.top_10_stocks).toHaveLength(2);
    expect(json.analysis.top_10_stocks.map((s: any) => s.ticker)).toEqual(['BBCA', 'BBRI']);
    expect(json.analysis.total_count).toBe(10);
    expect(json.analysis.locked_count).toBe(8);
    expect(json.analysis.is_guest_limited).toBe(true);
  });

  it('pengguna login menerima seluruh 10 emiten tanpa batasan tamu', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'user-123', email: 'user@sahamlens.id' } as any);

    const res = await GET(makeRequest('?profile=Moderat'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.analysis.top_10_stocks).toHaveLength(10);
    expect(json.analysis.total_count).toBe(10);
    expect(json.analysis.locked_count).toBe(0);
    expect(json.analysis.is_guest_limited).toBe(false);
  });
});
