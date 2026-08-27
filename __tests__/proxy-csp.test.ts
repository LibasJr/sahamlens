import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/shared/auth/jwt', () => ({
  decrypt: vi.fn().mockResolvedValue(null),
  encrypt: vi.fn(),
}));
vi.mock('@/shared/auth/admin-token', () => ({
  verifyAdminToken: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/shared/middleware/rate-limiter', () => ({
  checkRateLimitShared: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { config, proxy } from '../proxy';
import { decrypt } from '@/shared/auth/jwt';
import { verifyAdminToken } from '@/shared/auth/admin-token';
import { checkRateLimitShared } from '@/shared/middleware/rate-limiter';

function request(pathname: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost${pathname}`, init);
}

describe('proxy nonce CSP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('covers HTML routes that were not previously part of the access-control matcher', () => {
    expect(config.matcher).toContain('/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)');
  });

  it('adds a nonce policy to ordinary HTML without expanding auth/rate-limit behavior', async () => {
    const res = await proxy(request('/login'));
    const csp = res.headers.get('Content-Security-Policy');

    expect(res.status).toBe(200);
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain('https://static.cloudflareinsights.com');
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp?.split('; ').find((part) => part.startsWith('script-src '))).not.toContain("'unsafe-inline'");
    expect(decrypt).not.toHaveBeenCalled();
    expect(verifyAdminToken).not.toHaveBeenCalled();
    expect(checkRateLimitShared).not.toHaveBeenCalled();
  });

  it('keeps API responses outside document CSP', async () => {
    const res = await proxy(request('/api/market-pulse'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
  });

  it('does not attach document CSP to router prefetches', async () => {
    const res = await proxy(request('/login', {
      headers: { purpose: 'prefetch' },
    }));

    expect(res.headers.get('Content-Security-Policy')).toBeNull();
  });
});
