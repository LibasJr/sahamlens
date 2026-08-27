import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..', '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function stripImports(source: string): string {
  return source.replace(/^import\b[^;]*;/gm, '');
}

function body(rel: string): string {
  return stripImports(stripComments(read(rel)));
}

const adminPage = body('app/admin/transparency/page.tsx');
const publicRoute = body('app/api/transparency/route.ts');
const adminRoute = body('app/api/admin/transparency/route.ts');
const sitemap = stripComments(read('app/sitemap.ts'));
const proxy = stripComments(read('proxy.ts'));
const sidebar = stripComments(read('components/Sidebar.tsx'));

describe('transparansi public/admin split', () => {
  it('membaca berkas yang cukup untuk diperiksa', () => {
    for (const [name, source] of Object.entries({ adminPage, publicRoute, adminRoute, sitemap, proxy, sidebar })) {
      expect(source.length, `${name} nyaris kosong setelah komentar dibuang`).toBeGreaterThan(200);
    }
  });

  it('halaman admin menolak non-admin sebelum merender', () => {
    expect(adminPage).toMatch(/if\s*\(!\(await isAdminServer\(\)\)\)\s*\{\s*redirect\(['"]\/admin-login['"]\)/);
  });

  it('endpoint admin datanya ikut diperiksa, bukan cuma halamannya', () => {
    expect(
      adminRoute,
      '/api/admin/transparency terbuka - gerbang halaman jadi hiasan, data tetap bisa diambil langsung',
    ).toMatch(/if\s*\(\s*!\s*await isAdminFromRequestCookies[\s\S]{0,80}?throw new ForbiddenError\(\)/);
  });

  it('endpoint admin bersesi tidak boleh di-cache CDN sebagai publik', () => {
    expect(adminRoute).not.toContain('publicCacheHeaders');
  });

  it('endpoint publik hanya memakai projection publik yang aman', () => {
    expect(publicRoute).toContain('getPublicTransparencyData');
    expect(publicRoute).not.toContain('getTransparencyData');
    expect(publicRoute).not.toContain('isAdminFromRequestCookies');
  });

  it('route publik diiklankan dan dibuka untuk tamu, sementara admin tetap di grup admin', () => {
    expect(sitemap).toContain('transparency');
    expect(proxy).toContain("pathname === '/transparency'");
    expect(proxy).toContain("pathname === '/api/transparency'");
    const adminGroup = sidebar.slice(sidebar.indexOf('ADMIN_NAV_GROUP'));
    const userNav = sidebar.slice(0, sidebar.indexOf('ADMIN_NAV_GROUP'));
    expect(userNav).toContain("path: '/transparency'");
    expect(adminGroup).toContain("path: '/admin/transparency'");
  });
});
