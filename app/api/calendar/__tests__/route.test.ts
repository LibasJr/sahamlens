import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
}));
vi.mock('@/modules/market/service/corporate-calendar.service', () => ({
  fetchCorporateCalendar: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  getOrCompute: vi.fn(),
}));
vi.mock('@/shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(),
  applyAnonymousTrialCookie: vi.fn(),
}));

import { GET } from '../route';
import { getSession } from '@/modules/user';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie } from '@/shared/auth/anonymous-trial';

describe('GET /api/calendar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('menolak dengan 401 kalau tidak ada session DAN trial anonim sudah kadaluarsa', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue({
      firstSeenAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-08T00:00:00.000Z', active: false, isNew: false,
    });

    const res = await GET();

    expect(res.status).toBe(401);
    expect(getOrCompute).not.toHaveBeenCalled();
  });

  it('mengizinkan akses tanpa session kalau trial anonim masih aktif, dan menempelkan cookie trial baru', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const trial = { firstSeenAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-09T00:00:00.000Z', active: true, isNew: true };
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(trial);
    vi.mocked(getOrCompute).mockResolvedValue({ '2026-08-05': [] } as any);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.events).toEqual({ '2026-08-05': [] });
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), trial);
  });

  it('cookie trial yang SUDAH ADA (bukan baru) tidak ditempel ulang', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const trial = { firstSeenAt: '2026-07-28T00:00:00.000Z', expiresAt: '2026-08-04T00:00:00.000Z', active: true, isNew: false };
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(trial);
    vi.mocked(getOrCompute).mockResolvedValue({} as any);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), trial);
  });

  it('user dengan session valid tidak menyentuh logic trial anonim sama sekali', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(getOrCompute).mockResolvedValue({} as any);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
    expect(applyAnonymousTrialCookie).not.toHaveBeenCalled();
  });
});
