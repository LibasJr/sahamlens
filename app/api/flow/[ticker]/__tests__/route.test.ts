import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/security/api-rate-limit', () => ({
  checkPublicComputeBudget: vi.fn(),
}));
vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
  hasOpenOrProAccess: vi.fn(),
}));
vi.mock('@/modules/market', () => ({
  computeDailyNetFlow: vi.fn(),
  computeAccumulationStreak: vi.fn(),
  analyzeBandarmology: vi.fn(),
  analyzeAccumulationSignal: vi.fn(),
  getRealForeignFlow: vi.fn(),
  summarizeForeignFlow: vi.fn(),
  IDX_FOREIGN_FLOW_SOURCE: 'IDX_OFFICIAL_FOREIGN_FLOW',
}));

import { GET } from '../route';
import { checkPublicComputeBudget } from '@/shared/security/api-rate-limit';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import {
  analyzeAccumulationSignal,
  analyzeBandarmology,
  computeAccumulationStreak,
  computeDailyNetFlow,
  getRealForeignFlow,
  summarizeForeignFlow,
} from '@/modules/market';

function makeRequest() {
  return new Request('http://localhost/api/flow/BBCA');
}
function makeParams() {
  return { params: Promise.resolve({ ticker: 'BBCA' }) };
}

const officialHistory = [{
  date: '2026-08-19', close: 9100, volume: 1000, foreignBuy: 600, foreignSell: 300,
  netForeignVolume: 300, netForeignValueBillion: 2.73,
}];

describe('GET /api/flow/[ticker] source contract', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkPublicComputeBudget).mockResolvedValue({ allowed: true } as any);
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(true);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('prefers official IDX foreign-flow artifacts and does not call Yahoo', async () => {
    vi.mocked(getRealForeignFlow).mockReturnValue({
      history: officialHistory,
      updatedAt: '2026-08-19T08:00:00.000Z',
    } as any);
    vi.mocked(summarizeForeignFlow).mockReturnValue({ net5DBillion: 2.73 } as any);

    const res = await GET(makeRequest(), makeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.source).toBe('IDX_OFFICIAL_FOREIGN_FLOW');
    expect(json.foreignFlow20D[0].netValueBillion).toBe(2.73);
    expect(json.updatedAt).toBe('2026-08-19T08:00:00.000Z');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('labels Yahoo CMF explicitly as proxy only when official flow is unavailable', async () => {
    vi.mocked(getRealForeignFlow).mockReturnValue(null as any);
    const timestamps = Array.from({ length: 6 }, (_, i) => Math.floor(Date.parse(`2026-08-${String(11 + i).padStart(2, '0')}T00:00:00Z`) / 1000));
    vi.mocked(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: { result: [{
          timestamp: timestamps,
          indicators: { quote: [{
            high: [101, 102, 103, 104, 105, 106],
            low: [98, 99, 100, 101, 102, 103],
            close: [100, 101, 102, 103, 104, 105],
            volume: [1000, 1100, 1200, 1300, 1400, 1500],
          }] },
        }] },
      }),
    });
    const flow = timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      netValueBillion: i % 2 === 0 ? 1 : -0.5,
    }));
    vi.mocked(computeDailyNetFlow).mockReturnValue(flow as any);
    vi.mocked(computeAccumulationStreak).mockReturnValue(1);
    vi.mocked(analyzeAccumulationSignal).mockReturnValue({ status: 'NETRAL', volRatio: 1.1 } as any);
    vi.mocked(analyzeBandarmology).mockReturnValue({ cmf20: 0.12, netPressurePct: 4.2 } as any);

    const res = await GET(makeRequest(), makeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.source).toBe('YAHOO_CMF_PROXY');
    expect(json.updatedAt).toBeUndefined();
    expect(json.summary.cmf20).toBe(0.12);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rate-limits before auth/source/provider work and preserves Retry-After', async () => {
    vi.mocked(checkPublicComputeBudget).mockResolvedValue({ allowed: false, retryAfterSec: 19 } as any);

    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('19');
    expect(getSession).not.toHaveBeenCalled();
    expect(getRealForeignFlow).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
