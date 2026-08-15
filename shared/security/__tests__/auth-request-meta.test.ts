import { afterEach, describe, expect, it } from 'vitest';
import { getAuthRequestMeta } from '../auth-request-meta';

const originalJwtSecret = process.env.JWT_SECRET_KEY;

afterEach(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET_KEY;
  else process.env.JWT_SECRET_KEY = originalJwtSecret;
});

describe('getAuthRequestMeta', () => {
  it('menyimpan prefix IPv4 dan hash HMAC, bukan IP mentah', () => {
    process.env.JWT_SECRET_KEY = 'test-secret';
    const meta = getAuthRequestMeta(new Request('https://sahamlens.test/api/auth/login', {
      headers: { 'cf-connecting-ip': '203.0.113.42', 'user-agent': 'SahamLens test browser' },
    }));

    expect(meta.ipPrefix).toBe('203.0.113.0/24');
    expect(meta.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(meta.ipHash).not.toContain('203.0.113.42');
    expect(meta.userAgent).toBe('SahamLens test browser');
  });

  it('tidak membuat hash jika server belum memiliki secret', () => {
    delete process.env.JWT_SECRET_KEY;
    const meta = getAuthRequestMeta(new Request('https://sahamlens.test/api/auth/login', {
      headers: { 'x-forwarded-for': '198.51.100.20' },
    }));

    expect(meta.ipPrefix).toBe('198.51.100.0/24');
    expect(meta.ipHash).toBeNull();
  });
});
