import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
  checkProAccess: vi.fn(),
}));
vi.mock('@/shared/auth/internal-service', () => ({
  isInternalServiceRequest: vi.fn(),
}));
vi.mock('@/modules/recommendation', () => ({
  scanBreakouts: vi.fn(),
  scanCrossSignals: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  cacheGet: vi.fn(),
}));
vi.mock('@/shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(),
  applyAnonymousTrialCookie: vi.fn(),
}));

import { GET } from '../route';
import { getSession, checkProAccess } from '@/modules/user';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { cacheGet } from '@/shared/cache/redis-cache';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie } from '@/shared/auth/anonymous-trial';

function makeRequest(): Request {
  return new Request('http://localhost/api/breakout-radar');
}

describe('GET /api/breakout-radar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isInternalServiceRequest).mockReturnValue(false);
  });

  it('menolak dengan 401 kalau tidak ada session DAN trial anonim kadaluarsa', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue({
      firstSeenAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-08T00:00:00.000Z', active: false, isNew: false,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });

  it('trial anonim aktif melewati gerbang Pro juga', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const trial = { firstSeenAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-09T00:00:00.000Z', active: true, isNew: true };
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(trial);
    vi.mocked(cacheGet).mockResolvedValue({ data: [] } as any);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(checkProAccess).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(json).toEqual({ data: [] });
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), trial);
  });

  it('session valid tapi bukan Pro/trial -> 402, tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(checkProAccess).mockReturnValue(false);

    const res = await GET(makeRequest());

    expect(res.status).toBe(402);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
  });

  it('session valid dengan Pro -> 200, tidak menyentuh logic trial anonim', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(checkProAccess).mockReturnValue(true);
    vi.mocked(cacheGet).mockResolvedValue({ data: [] } as any);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
  });

  it('panggilan internal (cron) tetap lolos tanpa menyentuh logic trial anonim', async () => {
    vi.mocked(isInternalServiceRequest).mockReturnValue(true);
    vi.mocked(cacheGet).mockResolvedValue({ data: [] } as any);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(getSession).not.toHaveBeenCalled();
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
  });
});
