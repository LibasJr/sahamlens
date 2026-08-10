import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
}));
vi.mock('@/shared/middleware/compute-budget', () => ({
  computeActorFromRequest: vi.fn((_: Request, userId?: string | null) => userId ? `user:${userId}` : 'ip:unknown'),
  consumeComputeBudget: vi.fn(),
}));
vi.mock('@/shared/auth/anonymous-trial', () => ({
  readOrIssueAnonymousTrial: vi.fn(),
  applyAnonymousTrialCookie: vi.fn(),
}));
vi.mock('@/lib/aiProviders', () => ({
  generateAIResult: vi.fn(),
}));

import { POST } from '../route';
import { getSession } from '@/modules/user';
import { consumeComputeBudget } from '@/shared/middleware/compute-budget';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie } from '@/shared/auth/anonymous-trial';

function makeRequest() {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'halo' }),
  });
}

describe('POST /api/chat guest limit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('guest yang sudah kena limit diminta login untuk meneruskan percakapan', async () => {
    const trial = {
      firstSeenAt: '2026-08-10T08:00:00.000Z',
      expiresAt: '2026-08-17T08:00:00.000Z',
      active: true,
      isNew: true,
    };
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(trial);
    vi.mocked(consumeComputeBudget).mockResolvedValue({
      allowed: false,
      used: 42,
      limit: 40,
      remaining: 0,
      retryAfterSec: 600,
    });

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.errorCode).toBe('AUTH_REQUIRED_LIMIT');
    expect(json.content).toContain('Silakan login untuk meneruskan percakapan');
    expect(consumeComputeBudget).toHaveBeenCalledWith('anon-chat:2026-08-10T08:00:00.000Z', 3, 'public');
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), trial);
  });
});