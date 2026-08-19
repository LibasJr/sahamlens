import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/fundamental/repository/fundamental-history.repository', () => ({
  asOf: vi.fn(),
}));
vi.mock('@/modules/fundamental/service/fundamental-pit-adapter', () => ({
  fundamentalPitToAnalyzerPayload: vi.fn(),
}));
vi.mock('@/modules/fundamental/service/current-fundamental-source.service', () => ({
  fetchCurrentFundamentalSource: vi.fn(),
}));
vi.mock('@/modules/fundamental', () => ({
  analyzePe: vi.fn(() => ({ decision: 'NEUTRAL', confidence: 50 })),
  analyzePbv: vi.fn(() => ({ decision: 'NEUTRAL', confidence: 50 })),
  analyzeRoe: vi.fn(() => ({ decision: 'NEUTRAL', confidence: 50 })),
  analyzeRoa: vi.fn(() => ({ decision: 'NEUTRAL', confidence: 50 })),
  analyzeDer: vi.fn(() => ({ decision: 'NEUTRAL', confidence: 50 })),
  analyzeCurrentRatio: vi.fn(() => ({ decision: 'NEUTRAL', confidence: 50 })),
  analyzeQuickRatio: vi.fn(() => ({ decision: 'NEUTRAL', confidence: 50 })),
  analyzeDividend: vi.fn(() => ({ decision: 'NEUTRAL', confidence: 50 })),
  analyzeEpsGrowth: vi.fn(() => ({ decision: 'NEUTRAL', confidence: 50 })),
  analyzeRevenueGrowth: vi.fn(() => ({ decision: 'NEUTRAL', confidence: 50 })),
  analyzeGrossMargin: vi.fn(() => ({ decision: 'NEUTRAL', confidence: 50 })),
  analyzeOperatingMargin: vi.fn(() => ({ decision: 'NEUTRAL', confidence: 50 })),
  analyzeNetMargin: vi.fn(() => ({ decision: 'NEUTRAL', confidence: 50 })),
  calculateIntrinsicValue: vi.fn(async () => null),
  computeFundamentalQuality: vi.fn(() => 'NETRAL'),
  computeValuationLabel: vi.fn(() => 'DATA TIDAK CUKUP'),
}));
vi.mock('@/modules/validation', () => ({
  scoreFundamentalDataQuality: vi.fn(() => ({ score: 100 })),
}));
vi.mock('@/modules/fundamental/service/normalized-earnings.service', () => ({
  fetchNormalizedEarnings: vi.fn(async () => null),
}));
vi.mock('@/modules/fundamental/service/moat-durability.service', () => ({
  buildMoatDurability: vi.fn(() => null),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  getOrCompute: vi.fn(),
}));

import { GET } from '../route';
import { fetchCurrentFundamentalSource } from '@/modules/fundamental/service/current-fundamental-source.service';
import { getOrCompute } from '@/shared/cache/redis-cache';

function makeRequest(ticker: string, qs = ''): Request {
  return new Request(`http://localhost/api/fundamental/${ticker}${qs}`);
}

function makeParams(ticker: string) {
  return { params: Promise.resolve({ ticker }) };
}

// BUG FIX (2026-08-14, laporan pengguna "Fundamental/Moat lambat"): endpoint ini
// SEBELUMNYA memanggil Yahoo (quoteSummary + intrinsic value + normalized earnings)
// dan Google Translate LANGSUNG di setiap request, tanpa cache. Tes ini mengunci
// bahwa jalur "current fundamental" sekarang WAJIB lewat getOrCompute per ticker.
describe('GET /api/fundamental/[ticker]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('membaca lewat getOrCompute, kunci cache per ticker', async () => {
    vi.mocked(getOrCompute).mockImplementation(async (_key, _ttl, compute) => compute());
    vi.mocked(fetchCurrentFundamentalSource).mockResolvedValue({
      price: { regularMarketPrice: 9000, longName: 'Bank BCA', regularMarketChangePercent: 0.01, regularMarketVolume: 100 },
      assetProfile: { sector: 'Financial', industry: 'Bank', longBusinessSummary: null },
      defaultKeyStatistics: {},
      financialData: {},
      summaryDetail: {},
    } as any);

    const res = await GET(makeRequest('BBCA'), makeParams('BBCA'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ticker).toBe('BBCA.JK');
    expect(getOrCompute).toHaveBeenCalledWith(
      expect.stringContaining('sahamlens:cache:computed:fundamental:'),
      expect.any(Number),
      expect.any(Function),
    );
  });

  it('cache hit tidak memanggil fetchCurrentFundamentalSource sama sekali', async () => {
    const cached = { ticker: 'BBCA.JK', price: 9000 };
    vi.mocked(getOrCompute).mockResolvedValue(cached as any);

    const res = await GET(makeRequest('BBCA'), makeParams('BBCA'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(cached);
    expect(fetchCurrentFundamentalSource).not.toHaveBeenCalled();
  });

  it('quoteSummary null -> 404, hasil "not found" tetap boleh dicache (bukan diam-diam 200)', async () => {
    vi.mocked(getOrCompute).mockImplementation(async (_key, _ttl, compute) => compute());
    vi.mocked(fetchCurrentFundamentalSource).mockResolvedValue(null);

    const res = await GET(makeRequest('XXXX'), makeParams('XXXX'));

    expect(res.status).toBe(404);
  });

  it('mode PIT (?as_of=) tidak menyentuh getOrCompute - baca Postgres langsung', async () => {
    const res = await GET(makeRequest('BBCA', '?as_of=not-a-date'), makeParams('BBCA'));

    expect(res.status).toBe(400);
    expect(getOrCompute).not.toHaveBeenCalled();
  });
});
