import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/shared/cache/redis-cache', () => ({
  incrWithExpiry: vi.fn(),
}));

import { incrWithExpiry } from '@/shared/cache/redis-cache';
import { consumeGuestChat, GUEST_CHAT_LIMIT } from '@/shared/usage/guest-chat-quota';

describe('kuota chat guest', () => {
  beforeEach(() => vi.clearAllMocks());

  it(`mengizinkan pertanyaan ke-1 sampai ke-${GUEST_CHAT_LIMIT}`, async () => {
    for (let n = 1; n <= GUEST_CHAT_LIMIT; n++) {
      vi.mocked(incrWithExpiry).mockResolvedValueOnce(n);
      const quota = await consumeGuestChat('anon-1');
      expect(quota.allowed).toBe(true);
      expect(quota.remaining).toBe(GUEST_CHAT_LIMIT - n);
    }
  });

  it(`menolak pertanyaan ke-${GUEST_CHAT_LIMIT + 1}`, async () => {
    vi.mocked(incrWithExpiry).mockResolvedValue(GUEST_CHAT_LIMIT + 1);

    const quota = await consumeGuestChat('anon-1');

    expect(quota.allowed).toBe(false);
    expect(quota.remaining).toBe(0);
  });

  it('fail-open kalau Redis tidak terkonfigurasi/down (incrWithExpiry null)', async () => {
    vi.mocked(incrWithExpiry).mockResolvedValue(null);

    const quota = await consumeGuestChat('anon-1');

    expect(quota.allowed).toBe(true);
    expect(quota.remaining).toBe(GUEST_CHAT_LIMIT);
  });

  it('memakai kunci terpisah per identitas trial anonim', async () => {
    vi.mocked(incrWithExpiry).mockResolvedValue(1);

    await consumeGuestChat('anon-A');
    await consumeGuestChat('anon-B');

    expect(incrWithExpiry).toHaveBeenNthCalledWith(1, 'sahamlens:usage:guest-chat:anon-A', expect.any(Number));
    expect(incrWithExpiry).toHaveBeenNthCalledWith(2, 'sahamlens:usage:guest-chat:anon-B', expect.any(Number));
  });
});
