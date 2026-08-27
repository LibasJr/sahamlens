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

const publicPage = body('app/transparency/page.tsx');
const publicRoute = body('app/api/transparency/route.ts');
const adminPage = body('app/admin/transparency/page.tsx');
const adminRoute = body('app/api/admin/transparency/route.ts');
const adminClient = body('app/admin/transparency/TransparencyClient.tsx');
const sitemap = stripComments(read('app/sitemap.ts'));
const proxy = stripComments(read('proxy.ts'));
const sidebar = stripComments(read('components/Sidebar.tsx'));
const nextConfig = stripComments(read('next.config.mjs'));

describe('transparency public/admin split', () => {
  it('membaca berkas split transparansi yang cukup untuk diperiksa', () => {
    for (const [name, source] of Object.entries({ publicPage, publicRoute, adminPage, adminRoute, adminClient, sitemap, proxy, sidebar, nextConfig })) {
      expect(source.length, `${name} nyaris kosong setelah komentar dibuang`).toBeGreaterThan(200);
    }
  });

  it('halaman publik /transparency tidak redirect ke admin dan memakai payload publik', () => {
    expect(nextConfig).not.toContain("source: '/transparency'");
    expect(publicPage).toContain('getPublicTransparencyData');
    expect(publicPage).not.toContain('getTransparencyData');
    expect(publicPage).toContain('modelStatus');
    expect(publicPage).toContain('non-actionable');
  });

  it('endpoint publik /api/transparency memakai projection publik dan cache publik', () => {
    expect(publicRoute).toContain('getPublicTransparencyData');
    expect(publicRoute).toContain('publicCacheHeaders');
    expect(publicRoute).not.toContain('isAdminFromRequestCookies');
    expect(publicRoute).not.toContain('ForbiddenError');
  });

  it('diagnostik penuh tetap berada di endpoint admin yang diautentikasi dan tidak public-cache', () => {
    expect(adminRoute).toMatch(/if\s*\(\s*!\s*await isAdminFromRequestCookies[\s\S]{0,80}?throw new ForbiddenError\(\)/);
    expect(adminRoute).toContain('getTransparencyData');
    expect(adminRoute).not.toContain('publicCacheHeaders');
    expect(adminClient).toContain("apiRequest<TransparencyData>('/api/admin/transparency')");
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
