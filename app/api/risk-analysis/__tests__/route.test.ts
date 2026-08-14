import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/technical', () => ({
  fetchYahooHistory: vi.fn(),
}));
vi.mock('@/modules/market', () => ({
  calculateBeta: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  getOrCompute: vi.fn(),
}));

import { POST } from '../route';
import { fetchYahooHistory } from '@/modules/technical';
import { calculateBeta } from '@/modules/market';
import { getOrCompute } from '@/shared/cache/redis-cache';

function makeRequest(portfolio: unknown): Request {
  return new Request('http://localhost/api/risk-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ portfolio }),
  });
}

const oneYearHistory = { history: [{ Date: '2026-01-01', Close: 100 }], currentPrice: 100, regularMarketTime: null, previousClose: 99 };

// BUG FIX (2026-08-14, audit "semua menu harus ada cache"): IHSG & USDIDR=X (dan
// histori per ticker) sebelumnya menembak Yahoo LANGSUNG lewat fetchYahooHistory
// setiap kali Risk Matrix dijalankan, walau serinya sama untuk semua pengguna. Tes
// ini mengunci bahwa histori sekarang dibaca lewat getOrCompute, bukan langsung.
describe('POST /api/risk-analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCompute).mockImplementation(async (_key, _ttl, compute) => compute());
    vi.mocked(fetchYahooHistory).mockResolvedValue(oneYearHistory as any);
    vi.mocked(calculateBeta).mockReturnValue({ beta: 1.1 } as any);
  });

  it('histori IHSG & USDIDR dibaca lewat getOrCompute (cache-able), bukan fetchYahooHistory langsung', async () => {
    const res = await POST(makeRequest([{ ticker: 'BBCA', weight: 100 }]));

    expect(res.status).toBe(200);
    expect(getOrCompute).toHaveBeenCalledWith(
      expect.stringContaining('sahamlens:cache:computed:yahoo-history:^JKSE:1y'),
      expect.any(Number),
      expect.any(Function),
    );
    expect(getOrCompute).toHaveBeenCalledWith(
      expect.stringContaining('sahamlens:cache:computed:yahoo-history:USDIDR=X:1y'),
      expect.any(Number),
      expect.any(Function),
    );
    expect(getOrCompute).toHaveBeenCalledWith(
      expect.stringContaining('sahamlens:cache:computed:yahoo-history:BBCA.JK:1y'),
      expect.any(Number),
      expect.any(Function),
    );
  });

  it('cache hit untuk semua seri tidak memanggil fetchYahooHistory sama sekali', async () => {
    vi.mocked(getOrCompute).mockResolvedValue(oneYearHistory as any);

    const res = await POST(makeRequest([{ ticker: 'BBCA', weight: 100 }]));

    expect(res.status).toBe(200);
    expect(fetchYahooHistory).not.toHaveBeenCalled();
  });

  it('portofolio kosong -> 400', async () => {
    const res = await POST(makeRequest([]));
    expect(res.status).toBe(400);
  });
});
