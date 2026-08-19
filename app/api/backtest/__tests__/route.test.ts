import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../modules/user', () => ({
  getSession: vi.fn(),
  hasOpenOrProAccess: vi.fn(),
}));
vi.mock('../../../../modules/backtest', () => ({
  readBacktestCache: vi.fn(),
  precomputeBacktestData: vi.fn(),
  writeBacktestCache: vi.fn(),
  simulateBacktest: vi.fn(),
}));
vi.mock('../../../../shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(),
<<<<<<< HEAD
  buildAnonymousTrialCookie: vi.fn(async (trial: any) => trial?.isNew ? ({
    name: 'sl_anon_trial',
    value: 'signed-test-token',
    options: { httpOnly: true, sameSite: 'lax', path: '/' },
  }) : null),
=======
  buildAnonymousTrialCookie: vi.fn(),
>>>>>>> 0705cec16c9bb866b5e01e06de99d6d0c10d1f0a
}));

import { POST } from '../route';
import { getSession, hasOpenOrProAccess } from '../../../../modules/user';
import { readBacktestCache, precomputeBacktestData, writeBacktestCache, simulateBacktest } from '../../../../modules/backtest';
import { readOrIssueAnonymousTrial, buildAnonymousTrialCookie } from '../../../../shared/auth/anonymous-trial';

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

const anonTrial = { firstSeenAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-09T00:00:00.000Z', active: true, isNew: true };

describe('POST /api/backtest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(true);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(anonTrial);
  });

  it('session ada tapi bukan Pro/trial -> 402 (hasOpenOrProAccess menolak akun terdaftar)', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(false);

    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));
    const json = await res.json();

    expect(res.status).toBe(402);
    expect(json.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(readBacktestCache).not.toHaveBeenCalled();
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
    expect(writeBacktestCache).toHaveBeenCalledTimes(1);
    expect(writeBacktestCache).toHaveBeenCalledWith({ computedAt: 'y', ihsg: [], tickers: [] });
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

  it('menolak filter tidak dikenal dengan 400 (bukan diam-diam di-drop)', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    const res = await POST(makeRequest({ filters: ['RSI 14', 'Bollinger Bands'], modal: 100_000_000, period: 3 }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe('Filter tidak dikenal');
  });
});

// KEPUTUSAN PRODUK 2026-08-13: tamu (tanpa akun) dapat akses PENUH tanpa batas waktu -
// trial 7 hari anonim TIDAK LAGI menggerbang fitur ini. Kelompok tes ini dulu bernama
// "trial anonim" dan menguji 401 saat trial kadaluarsa; sekarang menguji bahwa tamu
// SELALU lolos, dan bahwa cookie trial tetap diterbitkan (dipakai identitas kuota chat
// guest & telemetri) walau tidak lagi dipakai untuk keputusan akses.
describe('POST /api/backtest (akses tamu)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(true);
  });

  it('tanpa session, trial anonim SUDAH kadaluarsa -> tetap 200 (bukan lagi 401)', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue({
      firstSeenAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-08T00:00:00.000Z', active: false, isNew: false,
    });
    vi.mocked(readBacktestCache).mockResolvedValue({ computedAt: 'x', ihsg: [], tickers: [] } as any);
    vi.mocked(simulateBacktest).mockReturnValue(sampleResult as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));

    expect(res.status).toBe(200);
  });

  it('tanpa session -> cookie trial anonim tetap ditempel (identitas kuota chat/telemetri)', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(anonTrial);
    vi.mocked(readBacktestCache).mockResolvedValue({ computedAt: 'x', ihsg: [], tickers: [] } as any);
    vi.mocked(simulateBacktest).mockReturnValue(sampleResult as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));

    expect(res.status).toBe(200);
    expect(buildAnonymousTrialCookie).toHaveBeenCalledWith(anonTrial);
  });

  it('tamu (guest/unauthenticated) menerima trades dibatasi ke 2 item dan is_guest_limited true', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readBacktestCache).mockResolvedValue({ computedAt: 'x', ihsg: [], tickers: [] } as any);
    vi.mocked(simulateBacktest).mockReturnValue({
      ...sampleResult,
      totalTrades: 5,
      trades: [
        { entryDate: '2026-01-01', date: '2026-01-15', symbol: 'BBCA.JK', buy: 9000, sell: 9500, pnlPct: 5.56 },
        { entryDate: '2026-01-10', date: '2026-01-20', symbol: 'BBRI.JK', buy: 4500, sell: 4700, pnlPct: 4.44 },
        { entryDate: '2026-01-15', date: '2026-01-25', symbol: 'BMRI.JK', buy: 6000, sell: 6200, pnlPct: 3.33 },
      ],
    } as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.is_guest_limited).toBe(true);
    expect(json.trades).toHaveLength(2);
    expect(json.trades_locked_count).toBe(3);
  });

  it('user login menerima seluruh riwayat trade tanpa pembatasan tamu', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(readBacktestCache).mockResolvedValue({ computedAt: 'x', ihsg: [], tickers: [] } as any);
    vi.mocked(simulateBacktest).mockReturnValue({
      ...sampleResult,
      totalTrades: 3,
      trades: [
        { entryDate: '2026-01-01', date: '2026-01-15', symbol: 'BBCA.JK', buy: 9000, sell: 9500, pnlPct: 5.56 },
        { entryDate: '2026-01-10', date: '2026-01-20', symbol: 'BBRI.JK', buy: 4500, sell: 4700, pnlPct: 4.44 },
        { entryDate: '2026-01-15', date: '2026-01-25', symbol: 'BMRI.JK', buy: 6000, sell: 6200, pnlPct: 3.33 },
      ],
    } as any);

    const res = await POST(makeRequest({ filters: ['RSI 14'], modal: 100_000_000, period: 3 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.is_guest_limited).toBe(false);
    expect(json.trades).toHaveLength(3);
    expect(json.trades_locked_count).toBe(0);
  });
});
