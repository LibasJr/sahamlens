import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/shared/middleware/require-auth', () => ({
  requireUser: vi.fn(async () => ({ id: 'usr_test_123', email: 'user@example.com' })),
}));

vi.mock('@/modules/watchlist/repository/watchlist.repository', () => ({
  listWatchlist: vi.fn(async () => [
    { symbol: 'BBCA.JK', buy_price: 9000, journal_note: 'Hold support' },
    { symbol: 'BBRI.JK', buy_price: null, journal_note: null },
  ]),
}));

vi.mock('@/modules/watchlist/repository/alert.repository', () => ({
  listAlerts: vi.fn(async () => [
    { id: 'a1', symbol: 'BBCA.JK', triggered: false },
    { id: 'a2', symbol: 'BBCA.JK', triggered: true },
  ]),
}));

vi.mock('@/shared/cache/redis-cache', () => ({
  cacheGet: vi.fn(async () => null),
}));

vi.mock('@/modules/market/service/corporate-calendar.service', () => ({
  readKseiCalendarArtifact: vi.fn(() => ({
    events: [
      {
        date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()),
        symbol: 'BBCA',
        type: 'DIVIDEND',
        title: 'Cum Date Dividen Interim',
        source: 'KSEI',
        verification: 'OFFICIAL',
      },
    ],
  })),
}));

import { GET } from '../route';

describe('GET /api/watchlist/digest', () => {
  it('menghasilkan ringkasan digest watchlist dan jadwal korporasi', async () => {
    const req = new NextRequest('http://localhost/api/watchlist/digest');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.watchlistCount).toBe(2);
    expect(body.positionedCount).toBe(1);
    expect(body.journaledCount).toBe(1);
    expect(body.activeAlertsCount).toBe(1);
    expect(body.triggeredAlertsCount).toBe(1);
    expect(Array.isArray(body.upcomingEvents)).toBe(true);
    expect(body.upcomingEvents.length).toBeGreaterThan(0);
    expect(body.upcomingEvents[0].symbol).toBe('BBCA');
  });
});
