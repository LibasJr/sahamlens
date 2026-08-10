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

import { config, proxy } from '../proxy';
import { checkRateLimitShared } from '@/shared/middleware/rate-limiter';
import { decrypt } from '@/shared/auth/jwt';
import { verifyAdminToken } from '@/shared/auth/admin-token';
import { PROTECTED_PAGES } from '@/shared/constants/access';

function request(pathname: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost${pathname}`, init);
}

describe('proxy guest public access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(decrypt).mockResolvedValue(null);
    vi.mocked(verifyAdminToken).mockResolvedValue(false);
  });

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

describe('proxy protected-page authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(decrypt).mockResolvedValue(null);
    vi.mocked(verifyAdminToken).mockResolvedValue(false);
  });

  it.each(PROTECTED_PAGES)('%s selalu tercakup matcher proxy', (pathname) => {
    expect(config.matcher).toContain(pathname + '/:path*');
  });

  it.each(PROTECTED_PAGES)('guest tetap diarahkan ke login dari %s', async (pathname) => {
    const res = await proxy(request(pathname));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login?');
    expect(res.headers.get('location')).toContain('next=' + encodeURIComponent(pathname));
  });

  it.each(PROTECTED_PAGES)('admin-by-key dapat membuka %s tanpa session user', async (pathname) => {
    vi.mocked(verifyAdminToken).mockResolvedValue(true);

    const res = await proxy(request(pathname, {
      headers: { cookie: 'sahamlens_admin=admin-token-valid' },
    }));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(verifyAdminToken).toHaveBeenCalledWith('admin-token-valid');
    expect(checkRateLimitShared).not.toHaveBeenCalled();
  });

  it('cookie admin yang tidak valid tidak dapat melewati login', async () => {
    const res = await proxy(request('/dashboard', {
      headers: { cookie: 'sahamlens_admin=token-palsu' },
    }));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login?');
    expect(verifyAdminToken).toHaveBeenCalledWith('token-palsu');
  });

  it.each([
    ['user biasa', { id: 'user-1', role: 'free', is_pro: false, trial_ends_at: null }],
    ['user Pro', { id: 'user-2', role: 'free', is_pro: true, pro_expires_at: null, trial_ends_at: null }],
    ['user dengan role admin', { id: 'user-3', role: 'admin', is_pro: false, trial_ends_at: null }],
  ])('%s dengan session user tidak diarahkan kembali ke login', async (_label, session) => {
    vi.mocked(decrypt).mockResolvedValue(session as any);

    const res = await proxy(request('/dashboard', {
      headers: { cookie: 'session=session-valid' },
    }));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });
});
