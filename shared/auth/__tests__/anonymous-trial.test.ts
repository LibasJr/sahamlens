import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCookieStore = { get: vi.fn(), set: vi.fn() };
vi.mock('next/headers', () => ({
  cookies: () => mockCookieStore,
}));

import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie } from '../anonymous-trial';
import { encrypt } from '../jwt';
import { ANON_TRIAL_COOKIE } from '../../constants/cookie-names';

describe('readOrIssueAnonymousTrial', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tidak ada cookie sama sekali -> trial baru, aktif', async () => {
    mockCookieStore.get.mockReturnValue(undefined);

    const trial = await readOrIssueAnonymousTrial();

    expect(trial.isNew).toBe(true);
    expect(trial.active).toBe(true);
  });

  it('cookie ada, firstSeenAt 3 hari lalu -> masih aktif, bukan baru', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const token = await encrypt({ firstSeenAt: threeDaysAgo }, '7d');
    mockCookieStore.get.mockReturnValue({ value: token });

    const trial = await readOrIssueAnonymousTrial();

    expect(trial.isNew).toBe(false);
    expect(trial.active).toBe(true);
    expect(trial.firstSeenAt).toBe(threeDaysAgo);
  });

  it('cookie ada, firstSeenAt 8 hari lalu -> tidak aktif lagi', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const token = await encrypt({ firstSeenAt: eightDaysAgo }, '30d');
    mockCookieStore.get.mockReturnValue({ value: token });

    const trial = await readOrIssueAnonymousTrial();

    expect(trial.active).toBe(false);
  });

  it('cookie ada tapi gagal decrypt (rusak/token acak) -> diperlakukan sama seperti tidak ada cookie', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'not-a-real-jwt' });

    const trial = await readOrIssueAnonymousTrial();

    expect(trial.isNew).toBe(true);
    expect(trial.active).toBe(true);
  });
});

describe('applyAnonymousTrialCookie', () => {
  beforeEach(() => vi.clearAllMocks());

  it('trial.isNew === false -> TIDAK menulis cookie (hanya ditulis sekali)', async () => {
    const res = { cookies: { set: vi.fn() } } as any;
    const trial = { firstSeenAt: '2026-08-01T00:00:00.000Z', expiresAt: '2026-08-08T00:00:00.000Z', active: true, isNew: false };

    await applyAnonymousTrialCookie(res, trial);

    expect(res.cookies.set).not.toHaveBeenCalled();
  });

  it('trial.isNew === true -> menulis cookie HttpOnly', async () => {
    const res = { cookies: { set: vi.fn() } } as any;
    const trial = { firstSeenAt: '2026-08-01T00:00:00.000Z', expiresAt: '2026-08-08T00:00:00.000Z', active: true, isNew: true };

    await applyAnonymousTrialCookie(res, trial);

    expect(res.cookies.set).toHaveBeenCalledTimes(1);
    const [name, , options] = res.cookies.set.mock.calls[0];
    expect(name).toBe(ANON_TRIAL_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });
});
