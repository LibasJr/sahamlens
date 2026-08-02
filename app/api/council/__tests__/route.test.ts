import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
  checkProAccessLive: vi.fn(),
}));
vi.mock('@/modules/ai', () => ({
  getCouncil: vi.fn(),
  runLocalCouncil: vi.fn(),
  getCouncilCache: vi.fn(),
}));
vi.mock('@/modules/technical', () => ({
  analyzeEma: vi.fn(),
  analyzeRsi: vi.fn(),
  analyzeMacd: vi.fn(),
  analyzeVolatility: vi.fn(),
  fetchYahooHistory: vi.fn(),
  calculateScore: vi.fn(),
}));
vi.mock('@/modules/market', () => ({
  computeDailyNetFlow: vi.fn(),
  computeAccumulationStreak: vi.fn(),
}));
vi.mock('yahoo-finance2', () => ({
  default: vi.fn().mockImplementation(function () {
    return { quoteSummary: vi.fn().mockResolvedValue({}) };
  }),
}));
vi.mock('@/shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(),
  applyAnonymousTrialCookie: vi.fn(),
}));

import { GET } from '../route';
import { getSession, checkProAccessLive } from '@/modules/user';
import { getCouncilCache } from '@/modules/ai';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie } from '@/shared/auth/anonymous-trial';

function makeRequest(): Request {
  return new Request('http://localhost/api/council?symbol=BBCA.JK');
}

describe('GET /api/council', () => {
  beforeEach(() => vi.clearAllMocks());

  it('menolak dengan 401 kalau tidak ada session DAN trial anonim kadaluarsa', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue({
      firstSeenAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-08T00:00:00.000Z', active: false, isNew: false,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });

  it('trial anonim aktif melewati gerbang Pro juga (dapat cached council), dan menempelkan cookie baru', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const trial = { firstSeenAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-09T00:00:00.000Z', active: true, isNew: true };
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(trial);
    vi.mocked(getCouncilCache).mockResolvedValue({ summary: 'stub cached council' } as any);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(checkProAccessLive).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(json).toEqual({ summary: 'stub cached council' });
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), trial);
  });

  it('session valid tapi bukan Pro/trial -> 402, tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(checkProAccessLive).mockResolvedValue(false);

    const res = await GET(makeRequest());

    expect(res.status).toBe(402);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
  });

  it('session valid dengan Pro -> 200 (cached), tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(checkProAccessLive).mockResolvedValue(true);
    vi.mocked(getCouncilCache).mockResolvedValue({ summary: 'stub' } as any);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
    expect(applyAnonymousTrialCookie).not.toHaveBeenCalled();
  });
});
