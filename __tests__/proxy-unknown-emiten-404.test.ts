import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/shared/auth/jwt', () => ({
  decrypt: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/shared/auth/admin-token', () => ({
  verifyAdminToken: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/shared/middleware/rate-limiter', () => ({
  checkRateLimitShared: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { proxy } from '../proxy';

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`);
}

/**
 * `/technical/[symbol]` adalah satu-satunya halaman dinamis di aplikasi ini, dan sekaligus
 * satu-satunya tempat yang bisa menyatakan "emiten ini tidak ada". Karena root layout memakai
 * nonce CSP + ada `app/loading.tsx`, halaman ini streaming sebelum render selesai - jadi
 * `notFound()` di halaman maupun di `generateMetadata` hanya mengganti isi body menjadi UI 404
 * sementara status HTTP-nya tetap 200 (terukur 2026-09-24 pada build produksi).
 *
 * Tes ini mengunci satu-satunya tempat status itu masih bisa ditentukan: proxy.
 */
describe('proxy menandai /technical/[symbol] yang tidak ada sebagai 404', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['/technical/AAAA', '/technical/ZZZZ', '/technical/XYZ9999', '/technical/RANDOMUNKNOWN999'])(
    'membalas 404 untuk %s',
    async (pathname) => {
      const res = await proxy(request(pathname));

      expect(res.status).toBe(404);
      expect(res.headers.get('x-middleware-rewrite')).toContain('/__tidak-ditemukan__');
    },
  );

  it.each(['/technical/BBCA', '/technical/bbca', '/technical/TLKM', '/technical/IHSG'])(
    'membiarkan %s lewat seperti biasa',
    async (pathname) => {
      const res = await proxy(request(pathname));

      expect(res.status).not.toBe(404);
      expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    },
  );

  it('menormalkan simbol berkode bursa .JK sebelum memeriksa daftar emiten', async () => {
    const res = await proxy(request('/technical/BBCA.JK'));

    expect(res.status).not.toBe(404);
  });

  it('tidak menyentuh rute API yang punya bentuk path mirip', async () => {
    const res = await proxy(request('/api/public-chart/AAAA'));

    expect(res.status).not.toBe(404);
  });

  it('membalas 404 untuk simbol yang tidak bisa dinormalkan', async () => {
    const res = await proxy(request('/technical/%20%20'));

    expect(res.status).toBe(404);
  });
});