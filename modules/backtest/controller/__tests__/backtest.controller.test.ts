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

  it('keeps guest identity/cookie and adds a backward-compatible success envelope', async () => {
    const payload = { return: '+1%', dataAsOf: '2026-08-27T02:00:00.000Z', trades: [] };
    vi.mocked(runBacktestSimulation).mockResolvedValue({ ok: true, body: payload });
    vi.mocked(buildAnonymousTrialCookie).mockResolvedValue({ name: 'anon', value: 'token', options: { httpOnly: true, sameSite: 'lax', path: '/' } } as any);

    const result = await handleRunBacktest(REQUEST());
    const body = result.body as any;

    expect(result.status).toBe(200);
    expect(result.cookiesToSet).toHaveLength(1);
    expect(runBacktestSimulation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ isGuest: true }));
    expect(body.return).toBe('+1%');
    expect(body.dataAsOf).toBe('2026-08-27T02:00:00.000Z');
    expect(body.ok).toBe(true);
    expect(body.data).toEqual(payload);
    expect(body.meta).toEqual(expect.objectContaining({
      dataAsOf: '2026-08-27T02:00:00.000Z',
      source: 'backtest-indicator-cache',
    }));
  });

  it('marks uncached success as backtest-simulation without inventing dataAsOf', async () => {
    vi.mocked(readBacktestCache).mockResolvedValue(null);
    const payload = { return: '+2%', trades: [] };
    vi.mocked(runBacktestSimulation).mockResolvedValue({ ok: true, body: payload });
    vi.mocked(buildAnonymousTrialCookie).mockResolvedValue(null as any);

    const result = await handleRunBacktest(REQUEST());
    const body = result.body as any;

    expect(result.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual(payload);
    expect(body.meta).toEqual(expect.objectContaining({ source: 'backtest-simulation' }));
    expect(body.meta.dataAsOf).toBeUndefined();
  });

  it('returns compute-budget 429 before parsing/simulating the body', async () => {
    vi.mocked(consumeComputeBudget).mockResolvedValue({ allowed: false, retryAfterSec: 90 } as any);
    const result = await handleRunBacktest(REQUEST());
    expect(result.status).toBe(429);
    expect(result.headers?.['Retry-After']).toBe('90');
    expect(runBacktestSimulation).not.toHaveBeenCalled();
  });

  it('does not issue a new guest cookie or envelope for validation/service errors', async () => {
    vi.mocked(runBacktestSimulation).mockResolvedValue({ ok: false, status: 400, body: { error: 'Pilih minimal 1 filter' } });
    const result = await handleRunBacktest(REQUEST());
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'Pilih minimal 1 filter' });
    expect(buildAnonymousTrialCookie).not.toHaveBeenCalled();
  });
});
