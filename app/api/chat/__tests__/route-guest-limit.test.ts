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
vi.mock('@/shared/usage/guest-chat-quota', () => ({
  consumeGuestChat: vi.fn(),
  GUEST_CHAT_LIMIT_MESSAGE: 'Jatah 25 pertanyaan LensAI untuk pengunjung sudah habis. Silakan masuk untuk melanjutkan percakapan.',
}));
// hasAnyAIProvider ikut di-mock karena guard() di lib/sahamLensGuard.ts memakainya saat
// modul route dimuat; tanpa ini import route-nya melempar sebelum satu test pun jalan.
vi.mock('@/lib/aiProviders', () => ({
  generateAIResult: vi.fn(),
  hasAnyAIProvider: vi.fn(() => true),
}));

import { POST } from '../route';
import { getSession } from '@/modules/user';
import { consumeComputeBudget } from '@/shared/middleware/compute-budget';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie } from '@/shared/auth/anonymous-trial';
import { consumeGuestChat } from '@/shared/usage/guest-chat-quota';

const TRIAL = {
  firstSeenAt: '2026-08-10T08:00:00.000Z',
  expiresAt: '2026-08-17T08:00:00.000Z',
  active: true,
  isNew: true,
};

function makeRequest(prompt = 'analisa BBCA dong') {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
}

function budgetAllowed() {
  vi.mocked(consumeComputeBudget).mockResolvedValue({ allowed: true, used: 3, limit: 40, remaining: 37 });
}

describe('POST /api/chat batas pertanyaan guest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(readOrIssueAnonymousTrial).mockResolvedValue(TRIAL);
  });

  it('guest yang jatah 25 pertanyaannya habis diminta masuk untuk melanjutkan', async () => {
    budgetAllowed();
    vi.mocked(consumeGuestChat).mockResolvedValue({ allowed: false, used: 26, remaining: 0, limit: 25 });

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.errorCode).toBe('AUTH_REQUIRED_LIMIT');
    expect(json.content).toContain('Silakan masuk untuk melanjutkan percakapan');
    expect(consumeGuestChat).toHaveBeenCalledWith('2026-08-10T08:00:00.000Z');
    expect(applyAnonymousTrialCookie).toHaveBeenCalledWith(expect.anything(), TRIAL);
  });

  // Compute budget adalah pengaman lonjakan CPU, BUKAN batas produk. Sebelum perbaikan
  // ini, guest yang kena compute budget dapat pesan "silakan login" - padahal login tidak
  // menyelesaikan apa pun untuk limiter jendela 10 menit.
  it('compute budget habis dibalas RATE_LIMIT (coba lagi), bukan suruhan login', async () => {
    vi.mocked(consumeComputeBudget).mockResolvedValue({
      allowed: false, used: 42, limit: 40, remaining: 0, retryAfterSec: 600,
    });

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.errorCode).toBe('RATE_LIMIT');
    expect(json.content).not.toContain('masuk');
    expect(consumeGuestChat).not.toHaveBeenCalled();
  });

  it('prompt kosong tidak memotong jatah guest', async () => {
    budgetAllowed();

    const res = await POST(makeRequest('   '));

    expect(res.status).toBe(400);
    expect(consumeGuestChat).not.toHaveBeenCalled();
  });

  it('user yang sudah login tidak kena batas guest sama sekali', async () => {
    vi.mocked(getSession).mockResolvedValue({
      id: 'user-1', email: 'a@b.c', role: 'free', is_pro: true, trial_ends_at: null,
    } as any);
    budgetAllowed();

    await POST(makeRequest('halo'));

    expect(consumeGuestChat).not.toHaveBeenCalled();
    expect(readOrIssueAnonymousTrial).not.toHaveBeenCalled();
  });
});
