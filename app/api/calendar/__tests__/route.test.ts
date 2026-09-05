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

  it('public-read: guest menerima event beserta coverage dan provenance', async () => {
    vi.mocked(getOrCompute).mockResolvedValue({
      events: { '2026-09-28': [{ symbol: 'DGWG', type: 'RUPSLB', source: 'KSEI_OFFICIAL' }] },
      coverage: {
        ksei: { status: 'COMPLETE', generatedAt: '2026-09-05T05:00:00Z', years: [2026], documentsDiscovered: 1, eventsVerified: 1, documentsRejected: 0 },
        yahoo: { status: 'PARTIAL_UNIVERSE', symbolsRequested: 50, symbolsFailed: 0 },
      },
    } as any);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      events: { '2026-09-28': [{ symbol: 'DGWG', type: 'RUPSLB', source: 'KSEI_OFFICIAL' }] },
      coverage: {
        ksei: { status: 'COMPLETE', generatedAt: '2026-09-05T05:00:00Z', years: [2026], documentsDiscovered: 1, eventsVerified: 1, documentsRejected: 0 },
        yahoo: { status: 'PARTIAL_UNIVERSE', symbolsRequested: 50, symbolsFailed: 0 },
      },
      meta: { sources: ['KSEI_OFFICIAL', 'YAHOO_FINANCE'], refreshedAt: expect.any(String), warning: null, requestId: expect.any(String) },
    });
  });
});
