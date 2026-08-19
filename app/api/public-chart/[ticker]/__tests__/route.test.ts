import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/security/api-rate-limit', () => ({
  checkPublicComputeBudget: vi.fn(),
}));

import { GET } from '../route';
import { checkPublicComputeBudget } from '@/shared/security/api-rate-limit';

const DAY_1 = Math.floor(Date.parse('2026-08-18T09:00:00.000Z') / 1000);
const DAY_2 = Math.floor(Date.parse('2026-08-19T09:00:00.000Z') / 1000);

function makeRequest(tf = '1Y') {
  return new Request(`http://localhost/api/public-chart/BBCA?tf=${tf}`);
}
function makeParams() {
  return { params: Promise.resolve({ ticker: 'BBCA' }) };
}
function yahooPayload(meta: Record<string, unknown>) {
  return {
    chart: {
      result: [{
        timestamp: [DAY_1],
        indicators: {
          quote: [{ open: [100], high: [106], low: [99], close: [104], volume: [1_000_000] }],
          adjclose: [{ adjclose: [103.5] }],
        },
        meta: {
          regularMarketTime: DAY_2,
          regularMarketPrice: 102,
          regularMarketDayHigh: 105,
          regularMarketDayLow: 98,
          regularMarketVolume: 700_000,
          ...meta,
        },
      }],
    },
  };
}

describe('GET /api/public-chart/[ticker]', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkPublicComputeBudget).mockResolvedValue({ allowed: true } as any);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('marks a synthesized current-session candle as PARTIAL with previous-close proxy provenance', async () => {
    vi.mocked(global.fetch as any).mockResolvedValue({ ok: true, json: async () => yahooPayload({}) });

    const res = await GET(makeRequest(), makeParams());
    const json = await res.json();
    const current = json.history.at(-1);

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
    expect(current.time).toBe('2026-08-19');
    expect(current.sessionStatus).toBe('PARTIAL');
    expect(current.openEstimated).toBe(true);
    expect(current.openSource).toBe('PREVIOUS_CLOSE_PROXY');
    expect(current.adjClose).toBeNull();
    expect(current.open).toBeGreaterThanOrEqual(current.low);
    expect(current.open).toBeLessThanOrEqual(current.high);
  });

  it('preserves provider open provenance when Yahoo supplies regularMarketOpen', async () => {
    vi.mocked(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => yahooPayload({ regularMarketOpen: 101 }),
    });

    const res = await GET(makeRequest(), makeParams());
    const json = await res.json();
    const current = json.history.at(-1);

    expect(current.open).toBe(101);
    expect(current.openEstimated).toBe(false);
    expect(current.openSource).toBe('PROVIDER');
    expect(current.sessionStatus).toBe('PARTIAL');
  });

  it('returns Retry-After and never hits Yahoo when public compute budget is exhausted', async () => {
    vi.mocked(checkPublicComputeBudget).mockResolvedValue({ allowed: false, retryAfterSec: 37 } as any);

    const res = await GET(makeRequest(), makeParams());
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('37');
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
    expect(json.error).toContain('Terlalu banyak');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
