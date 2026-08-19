import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/user', () => ({ getSession: vi.fn(), hasOpenOrProAccess: vi.fn() }));
vi.mock('@/shared/auth/anonymous-trial', () => ({ readOrIssueAnonymousTrial: vi.fn(), buildAnonymousTrialCookie: vi.fn() }));
vi.mock('@/modules/backtest', () => ({ scanLiveFilterCheck: vi.fn() }));
vi.mock('@/shared/logger/logger', () => ({ logger: { error: vi.fn() } }));

import { handleLiveFilterCheck } from '../live-filter-check.controller';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import { readOrIssueAnonymousTrial, buildAnonymousTrialCookie } from '@/shared/auth/anonymous-trial';
import { scanLiveFilterCheck } from '@/modules/backtest';

function request(filters: unknown[]) {
  return new Request('http://localhost/api/backtest/live-filter-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filters }),
  });
}

describe('handleLiveFilterCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(true);
    vi.mocked(getSession).mockResolvedValue({ id: 'u1' } as any);
  });

  it('rejects unknown indicators before scanning providers', async () => {
    const result = await handleLiveFilterCheck(request(['Not a real filter']));
    expect(result).toMatchObject({ status: 400, body: { code: 'VALIDATION_ERROR' } });
    expect(scanLiveFilterCheck).not.toHaveBeenCalled();
  });

  it('keeps subscription gate ahead of live scan', async () => {
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(false);
    const result = await handleLiveFilterCheck(request(['RSI 14']));
    expect(result).toMatchObject({ status: 402, body: { code: 'SUBSCRIPTION_REQUIRED' } });
    expect(scanLiveFilterCheck).not.toHaveBeenCalled();
  });

  it('limits anonymous output to one visible match and emits trial cookie', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue({ firstSeenAt: '2026-08-19T00:00:00.000Z', expiresAt: '2026-08-26T00:00:00.000Z', active: true, isNew: true });
    vi.mocked(buildAnonymousTrialCookie).mockResolvedValue({ name: 'anon', value: 'token', options: { httpOnly: true, sameSite: 'lax', path: '/' } });
    vi.mocked(scanLiveFilterCheck).mockResolvedValue({
      scannedAt: '2026-08-19T00:00:00.000Z', filters: ['RSI 14'], matches: [{ ticker: 'BBCA' }, { ticker: 'BMRI' }], skipped: [],
    } as any);

    const result = await handleLiveFilterCheck(request(['RSI 14']));
    expect(result).toMatchObject({ status: 200, body: { total_matches: 2, locked_count: 1, is_guest_limited: true } });
    expect((result.body as any).matches).toHaveLength(1);
    expect(result.cookiesToSet).toHaveLength(1);
  });
});
