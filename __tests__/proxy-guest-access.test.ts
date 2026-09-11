import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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

import { config, proxy, isProxyExemptPath } from '../proxy';
import { checkRateLimitShared } from '@/shared/middleware/rate-limiter';
import { decrypt } from '@/shared/auth/jwt';
import { verifyAdminToken } from '@/shared/auth/admin-token';
import { PROTECTED_PAGES } from '@/shared/constants/access';

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(pathname: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost${pathname}`, init);
}

describe('proxy guest public access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimitShared).mockResolvedValue({ allowed: false, retryAfterSec: 60 });
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

  it('membatasi login 10 kali per 15 menit untuk kombinasi IP dan email', async () => {
    const res = await proxy(request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'User@Example.ID', password: 'wrong' }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(res.status).toBe(429);
    expect(checkRateLimitShared).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:login:unknown:[0-9a-f]{64}$/),
      expect.any(Number),
      expect.objectContaining({ maxPerWindow: 10, windowMs: 15 * 60_000 }),
      { degradedPolicy: 'memory' },
    );
  });

  it('fail-closed untuk auth saat limiter Redis tidak tersedia di production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(checkRateLimitShared).mockResolvedValueOnce({
      allowed: false,
      backend: 'unavailable',
      degraded: true,
      unavailable: true,
    });

    const res = await proxy(request('/api/auth/login', { method: 'POST' }));

    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(await res.json()).toEqual({
      error: 'Layanan autentikasi sementara tidak tersedia. Coba lagi nanti.',
    });
    expect(checkRateLimitShared).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:login:unknown:[0-9a-f]{64}$/),
      expect.any(Number),
      expect.objectContaining({ maxPerWindow: 10, windowMs: 15 * 60_000 }),
      { degradedPolicy: 'deny' },
    );
  });

  it('membatasi kirim OTP per email, per IP, dan cooldown server 60 detik', async () => {
    vi.mocked(checkRateLimitShared)
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfterSec: 60 });

    const res = await proxy(request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'User@Example.ID' }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(checkRateLimitShared).toHaveBeenNthCalledWith(1, expect.stringMatching(/^auth:otp:cooldown:[0-9a-f]{64}$/), expect.any(Number), expect.objectContaining({ maxPerWindow: 1, windowMs: 60_000 }), { degradedPolicy: 'memory' });
    expect(checkRateLimitShared).toHaveBeenNthCalledWith(2, expect.stringMatching(/^auth:otp:email:[0-9a-f]{64}$/), expect.any(Number), expect.objectContaining({ maxPerWindow: 3, windowMs: 60 * 60_000 }), { degradedPolicy: 'memory' });
    expect(checkRateLimitShared).toHaveBeenNthCalledWith(3, 'auth:otp:ip:unknown', expect.any(Number), expect.objectContaining({ maxPerWindow: 10, windowMs: 60 * 60_000 }), { degradedPolicy: 'memory' });
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
    const res = await proxy(request('/portfolio', {
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

    const res = await proxy(request('/portfolio', {
      headers: { cookie: 'session=session-valid' },
    }));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('halaman fitur analisis terbuka untuk tamu (keputusan produk 2026-08-13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(decrypt).mockResolvedValue(null);
    vi.mocked(verifyAdminToken).mockResolvedValue(false);
  });

  // Halaman ini SEBELUMNYA ada di PROTECTED_PAGES dan menendang tamu ke /login.
  // Sekarang hanya Portfolio & Watchlist yang wajib akun (data pribadi tersimpan) -
  // sisanya harus terbuka untuk tamu tanpa redirect. Kalau tes ini gagal karena
  // PROTECTED_PAGES bertambah lagi, itu sinyal untuk memastikan penambahannya
  // memang disengaja, bukan regresi ke kebijakan lama.
  it.each([
    '/dashboard',
    '/fundamental',
    '/screener',
    '/compare',
    '/backtest',
    '/risk-calculator',
    '/recommendations',
    '/dcf',
    '/macro',
    '/moat',
    '/pattern',
    '/risk',
    '/dividend',
    '/earnings',
    '/market',
  ])('tamu tidak diarahkan ke login dari %s', async (pathname) => {
    const res = await proxy(request(pathname));
    expect(res.status).not.toBe(307);
    expect(res.headers.get('location')).toBeNull();
  });

  it('Portfolio & Watchlist tetap wajib akun - satu-satunya pengecualian', () => {
    expect(PROTECTED_PAGES).toEqual(['/portfolio', '/watchlist']);
  });
});

/**
 * MATCHER SEBAGAI DAFTAR-PENGECUALIAN, BUKAN DAFTAR-IZIN.
 *
 * Sebelum 2026-08-19, `config.matcher` menyebut 24 prefix /api satu per satu. Bentuk itu
 * gagal secara diam-diam: route API baru tidak terlindungi sampai ada yang ingat
 * menambahkannya, dan tidak ada satu pun sinyal bahwa ia terlewat. Enam route memang
 * sedang terlewat saat itu.
 *
 * Tes ini menutup kemungkinan itu untuk selamanya: setiap berkas route yang ada di disk
 * harus tercakup pola `/api/:path*` ATAU dibebaskan lewat isProxyExemptPath(). Menambah
 * route baru tanpa memikirkan perlindungannya tidak lagi mungkin - pilihannya cuma dua,
 * dan keduanya terlihat.
 */
describe('cakupan matcher proxy', () => {
  const REPO_ROOT = path.join(__dirname, '..');

  function listApiRoutes(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return listApiRoutes(full);
      if (entry.name !== 'route.ts') return [];
      // app/api/foo/bar/route.ts -> /api/foo/bar  ([ticker] tetap apa adanya; yang
      // diperiksa cakupan pola, bukan pencocokan nilai parameter sungguhan.)
      const rel = path.relative(path.join(REPO_ROOT, 'app'), path.dirname(full));
      return ['/' + rel.split(path.sep).join('/')];
    });
  }

  const apiRoutes = listApiRoutes(path.join(REPO_ROOT, 'app', 'api'));

  it('menemukan seluruh route API', () => {
    expect(apiRoutes.length).toBeGreaterThan(90);
  });

  it('mencakup seluruh permukaan API dengan satu pola, bukan daftar prefix', () => {
    expect(config.matcher).toContain('/api/:path*');
    const leftoverApiPrefixes = config.matcher.filter(
      (entry) => entry.startsWith('/api/') && entry !== '/api/:path*',
    );
    expect(leftoverApiPrefixes).toEqual([]);
  });

  it('setiap route API tercakup pola atau dibebaskan secara eksplisit', () => {
    const uncovered = apiRoutes.filter(
      (route) => !route.startsWith('/api/') && !isProxyExemptPath(route),
    );
    expect(uncovered).toEqual([]);
  });

  it('membebaskan cron, webhook pembayaran, health check, dan logo emiten', () => {
    expect(isProxyExemptPath('/api/cron/news')).toBe(true);
    expect(isProxyExemptPath('/api/payment/notify')).toBe(true);
    expect(isProxyExemptPath('/api/health')).toBe(true);
    expect(isProxyExemptPath('/api/company-logo')).toBe(true);
  });

  it('TIDAK membebaskan endpoint pengguna biasa', () => {
    for (const route of ['/api/screener', '/api/watchlist', '/api/portfolio', '/api/auth/login']) {
      expect(isProxyExemptPath(route), `${route} tidak boleh dibebaskan`).toBe(false);
    }
  });

  it('melewatkan path yang dibebaskan tanpa menyentuh limiter', async () => {
    const res = await proxy(request('/api/cron/news', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(checkRateLimitShared).not.toHaveBeenCalled();
  });

  it('webhook pembayaran tidak lagi ikut kuota harian', async () => {
    // Regresi nyata: /api/payment/:path* dulu ADA di matcher dan tidak pernah dibebaskan,
    // jadi notifikasi pembayaran ikut menghabiskan 150/hari dari IP penyedia - dan yang
    // ditolak 429 hilang tanpa jejak.
    const res = await proxy(request('/api/payment/notify', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(checkRateLimitShared).not.toHaveBeenCalled();
  });
});
