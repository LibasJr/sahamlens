import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/user', () => ({ getSession: vi.fn(), hasOpenOrProAccess: vi.fn() }));
vi.mock('@/shared/middleware/compute-budget', () => ({ computeActorFromRequest: vi.fn(() => 'actor'), consumeComputeBudget: vi.fn() }));
vi.mock('@/shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(),
  buildAnonymousTrialCookie: vi.fn(),
}));
vi.mock('@/modules/backtest', () => ({ readBacktestCache: vi.fn() }));
vi.mock('../../service/backtest-run.service', () => ({ runBacktestSimulation: vi.fn() }));
vi.mock('@/shared/logger/logger', () => ({ logger: { error: vi.fn() } }));

import { handleRunBacktest } from '../backtest.controller';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import { consumeComputeBudget } from '@/shared/middleware/compute-budget';
import { readOrIssueAnonymousTrial, buildAnonymousTrialCookie } from '@/shared/auth/anonymous-trial';
import { readBacktestCache } from '@/modules/backtest';
import { runBacktestSimulation } from '../../service/backtest-run.service';

const TRIAL = { firstSeenAt: '2026-08-19T00:00:00.000Z', expiresAt: '2026-08-26T00:00:00.000Z', active: true, isNew: true };
const REQUEST = () => new Request('http://localhost/api/backtest', { method: 'POST', body: JSON.stringify({ filters: ['RSI 14'], modal: 10_000_000, period: 6 }) });

describe('handleRunBacktest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(null as any);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(TRIAL as any);
    vi.mocked(hasOpenOrProAccess).mockResolvedValue(true);
    vi.mocked(readBacktestCache).mockResolvedValue({ tickers: {} } as any);
    vi.mocked(consumeComputeBudget).mockResolvedValue({ allowed: true } as any);
  });

  it('keeps guest compute actor tied to anonymous trial identity', async () => {
    vi.mocked(runBacktestSimulation).mockResolvedValue({ ok: true, body: { return: '+1%' } });
    vi.mocked(buildAnonymousTrialCookie).mockResolvedValue({ name: 'anon', value: 'token', options: { httpOnly: true, sameSite: 'lax', path: '/' } } as any);
    const result = await handleRunBacktest(REQUEST());
    expect(result.status).toBe(200);
    expect(result.cookiesToSet).toHaveLength(1);
    expect(runBacktestSimulation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ isGuest: true }));
  });

  it('returns compute-budget 429 before parsing/simulating the body', async () => {
    vi.mocked(consumeComputeBudget).mockResolvedValue({ allowed: false, retryAfterSec: 90 } as any);
    const result = await handleRunBacktest(REQUEST());
    expect(result.status).toBe(429);
    expect(result.headers?.['Retry-After']).toBe('90');
    expect(runBacktestSimulation).not.toHaveBeenCalled();
  });

  it('does not issue a new guest cookie for validation/service errors', async () => {
    vi.mocked(runBacktestSimulation).mockResolvedValue({ ok: false, status: 400, body: { error: 'Pilih minimal 1 filter' } });
    const result = await handleRunBacktest(REQUEST());
    expect(result.status).toBe(400);
    expect(buildAnonymousTrialCookie).not.toHaveBeenCalled();
  });
});
