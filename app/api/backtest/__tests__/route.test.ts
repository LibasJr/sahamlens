import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../modules/user', () => ({
  getSession: vi.fn(),
}));
vi.mock('../../../../modules/backtest', () => ({
  readBacktestCache: vi.fn(),
  precomputeBacktestData: vi.fn(),
  simulateBacktest: vi.fn(),
}));

import { POST } from '../route';
import { getSession } from '../../../../modules/user';
import { readBacktestCache, precomputeBacktestData, simulateBacktest } from '../../../../modules/backtest';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/backtest', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const sampleResult = {
  returnPct: 12.34, ihsgReturnPct: -0.89, alphaPct: 13.23, winRatePct: 60,
  totalTrades: 5, maxDrawdownPct: -8.2,
  equityCurve: [100_000_000, 105_000_000], ihsgCurve: [100_000_000, 99_100_000],
  trades: [{ entryDate: '2026-01-01', date: '2026-01-15', symbol: 'BBCA.JK', buy: 9000, sell: 9500, pnlPct: 5.56 }],
  computedAt: '2026-08-01T00:00:00.000Z',
};

describe('POST /api/backtest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('menolak request tanpa session dengan 401', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));
    expect(res.status).toBe(401);
  });

  it('pakai cache kalau ada, dan format response sesuai kontrak lama (string bertanda +/-)', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(readBacktestCache).mockResolvedValue({ computedAt: 'x', ihsg: [], tickers: [] } as any);
    vi.mocked(simulateBacktest).mockReturnValue(sampleResult as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));
    const json = await res.json();

    expect(precomputeBacktestData).not.toHaveBeenCalled();
    expect(json.return).toBe('+12.34%');
    expect(json.ihsgReturn).toBe('-0.89%');
    expect(json.alpha).toBe('+13.23%');
    expect(json.winRate).toBe('60%');
    expect(json.maxDD).toBe('-8.2%');
    expect(json.totalTrades).toBe(5);
    expect(json.trades[0]).toEqual({ date: '2026-01-15', symbol: 'BBCA.JK', buy: 9000, pnl: '+5.56%' });
    expect(json.dataAsOf).toBe('2026-08-01T00:00:00.000Z');
  });

  it('fallback ke precompute sinkron kalau cache kosong', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(readBacktestCache).mockResolvedValue(null);
    vi.mocked(precomputeBacktestData).mockResolvedValue({ computedAt: 'y', ihsg: [], tickers: [] } as any);
    vi.mocked(simulateBacktest).mockReturnValue(sampleResult as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));

    expect(precomputeBacktestData).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('0 trade balas pesan eksplisit, bukan NaN/Infinity di response', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(readBacktestCache).mockResolvedValue({ computedAt: 'x', ihsg: [], tickers: [] } as any);
    vi.mocked(simulateBacktest).mockReturnValue({ ...sampleResult, totalTrades: 0, winRatePct: 0, trades: [] } as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));
    const json = await res.json();

    expect(json.totalTrades).toBe(0);
    expect(json.message).toBe('Tidak ada saham yang memenuhi kriteria filter ini dalam periode terpilih.');
  });

  it('menolak modal <= 0 dengan 400', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 0, period: 3 }));
    expect(res.status).toBe(400);
  });

  it('menolak filters kosong dengan 400', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    const res = await POST(makeRequest({ filters: [], modal: 100_000_000, period: 3 }));
    expect(res.status).toBe(400);
  });
});
