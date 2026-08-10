import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/shared/auth/jwt', () => ({
  decrypt: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/shared/auth/admin-token', () => ({
  verifyAdminToken: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/shared/middleware/rate-limiter', () => ({
  checkRateLimitShared: vi.fn().mockResolvedValue({ allowed: false, retryAfterSec: 60 }),
}));

import { proxy } from '../proxy';
import { checkRateLimitShared } from '@/shared/middleware/rate-limiter';

function request(pathname: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost${pathname}`, init);
}

describe('proxy guest public access', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tidak menjalankan limiter umum untuk API LensMarket publik', async () => {
    const res = await proxy(request('/api/market-pulse'));

    expect(res.status).toBe(200);
    expect(checkRateLimitShared).not.toHaveBeenCalled();
  });

  it('tidak menjalankan limiter umum untuk Ask LensAI karena /api/chat punya limiter sendiri', async () => {
    const res = await proxy(request('/api/chat', { method: 'POST' }));

    expect(res.status).toBe(200);
    expect(checkRateLimitShared).not.toHaveBeenCalled();
  });

  it('tetap menjalankan brute-force limiter untuk login', async () => {
    const res = await proxy(request('/api/auth/login', { method: 'POST' }));

    expect(res.status).toBe(429);
    expect(checkRateLimitShared).toHaveBeenCalledWith(
      'auth:/api/auth/login:unknown',
      expect.any(Number),
      expect.objectContaining({ maxPerWindow: 10 }),
    );
  });
});