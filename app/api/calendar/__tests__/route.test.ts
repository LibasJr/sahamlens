import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/market/service/corporate-calendar.service', () => ({
  fetchCorporateCalendar: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  getOrCompute: vi.fn(),
}));

import { GET } from '../route';
import { getOrCompute } from '@/shared/cache/redis-cache';

// Route handler Next menerima Request wajib (bukan opsional) - itu kontrak yang
// diperiksa saat `next build` membangkitkan tipe route.
function makeRequest(): Request {
  return new Request('http://localhost/api/calendar');
}

describe('GET /api/calendar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('public-read: guest tanpa session tetap menerima corporate calendar', async () => {
    vi.mocked(getOrCompute).mockResolvedValue({ '2026-08-10': [{ symbol: 'BBCA', type: 'DIVIDEND' }] } as any);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.events).toEqual({ '2026-08-10': [{ symbol: 'BBCA', type: 'DIVIDEND' }] });
  });
});
