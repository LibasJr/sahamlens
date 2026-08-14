import { describe, it, expect, vi, beforeEach } from 'vitest';

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

function makeRequest(qs = ''): Request {
  return new Request(`http://localhost/api/screener${qs}`);
}

const universe = [
  { ticker: 'BBCA', sector: 'Keuangan' },
  { ticker: 'TLKM', sector: 'Infrastruktur' },
];

// BARU (2026-08-14, masukan review eksternal - filter Sektor & Harga di LensScanner).
// Tes ini mengunci pengkabelan query param -> rankScreener, dan availableSectors
// SELALU dari universe penuh (bukan hasil yang sudah difilter).
describe('GET /api/screener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCompute).mockResolvedValue(universe as any);
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(null);
    vi.mocked(rankScreener).mockReturnValue([] as any);
  });

  it('meneruskan sector & maxPrice dari query string ke rankScreener', async () => {
    const res = await GET(makeRequest('?profile=Moderat&sector=Keuangan&maxPrice=5000'));

    expect(res.status).toBe(200);
    expect(rankScreener).toHaveBeenCalledWith(universe, 'Moderat', { sector: 'Keuangan', maxPrice: 5000 });
  });

  it('tanpa query filter, sector & maxPrice diteruskan undefined', async () => {
    await GET(makeRequest('?profile=Moderat'));

    expect(rankScreener).toHaveBeenCalledWith(universe, 'Moderat', { sector: undefined, maxPrice: undefined });
  });

  it('maxPrice bukan angka positif diabaikan (diteruskan undefined)', async () => {
    await GET(makeRequest('?profile=Moderat&maxPrice=-100'));

    expect(rankScreener).toHaveBeenCalledWith(universe, 'Moderat', { sector: undefined, maxPrice: undefined });
  });

  it('availableSectors berasal dari universe PENUH, diurutkan alfabet', async () => {
    const res = await GET(makeRequest('?profile=Moderat&sector=Keuangan'));
    const json = await res.json();

    expect(json.availableSectors).toEqual(['Infrastruktur', 'Keuangan']);
  });
});
