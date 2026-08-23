import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * KENAPA TEST INI ADA.
 *
 * Transparansi Validasi LensRadar dulu halaman PUBLIK di /transparency. Sejak 23 Agustus
 * 2026 ia internal, dan "internal" di sini bukan satu perubahan melainkan lima yang harus
 * benar bersamaan:
 *
 *   1. halamannya memeriksa keadminan sebelum merender apa pun;
 *   2. endpoint datanya ikut diperiksa - gerbang yang bisa dilewati dengan mengetik
 *      /api/transparency di address bar bukan gerbang (CLAUDE.md §2);
 *   3. endpoint itu TIDAK memakai publicCacheHeaders - Cloudflare menyajikan satu salinan
 *      ke siapa pun, jadi satu tarikan admin akan disajikan ulang ke pengunjung (§3);
 *   4. rutenya tidak lagi diiklankan ke crawler lewat sitemap;
 *   5. rutenya tidak lagi masuk allowlist halaman tamu di proxy.
 *
 * Yang berbahaya bukan kelimanya gagal sekaligus - itu akan ketahuan. Yang berbahaya
 * adalah SATU di antaranya diam-diam kembali: halaman tetap terkunci, tapi datanya
 * mengalir lewat pintu lain, dan tidak ada yang merah.
 */
const ROOT = path.join(__dirname, '..', '..', '..', '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** CLAUDE.md §2: cocokkan kode, bukan prosa yang menjelaskan kode. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Baris import ikut dibuang sebelum pencocokan.
 *
 * Ini bukan kerapian. Versi pertama test ini menuntut berkas route "mengandung
 * isAdminFromRequestCookies" - lalu penjaganya dihapus untuk uji coba dan testnya TETAP
 * HIJAU, karena namanya masih tertinggal di baris import. Gerbang yang lulus tanpa
 * memeriksa apa pun lebih buruk daripada tidak ada gerbang (CLAUDE.md §2).
 */
function stripImports(source: string): string {
  // `[^;]*` berhenti di titik koma pertama, jadi ia menelan import multi-baris utuh
  // tanpa ikut memakan kode di antaranya.
  return source.replace(/^import\b[^;]*;/gm, '');
}

function body(rel: string): string {
  return stripImports(stripComments(read(rel)));
}

const page = body('app/admin/transparency/page.tsx');
const route = body('app/api/transparency/route.ts');
const sitemap = stripComments(read('app/sitemap.ts'));
const proxy = stripComments(read('proxy.ts'));
const sidebar = stripComments(read('components/Sidebar.tsx'));

describe('transparansi hanya untuk admin', () => {
  it('membaca berkas yang cukup untuk diperiksa', () => {
    // Penjaga jumlah: kalau path-nya meleset, readFileSync sudah melempar - tapi berkas
    // yang habis dikupas komentarnya bisa saja tinggal remah, dan test di bawah lulus
    // tanpa memeriksa apa pun (CLAUDE.md §2).
    for (const [name, source] of Object.entries({ page, route, sitemap, proxy, sidebar })) {
      expect(source.length, `${name} nyaris kosong setelah komentar dibuang`).toBeGreaterThan(200);
    }
  });

  it('halamannya menolak non-admin sebelum merender', () => {
    // Bentuk penjaganya, bukan sekadar nama fungsinya muncul di suatu tempat.
    expect(page).toMatch(/if\s*\(!\(await isAdminServer\(\)\)\)\s*\{\s*redirect\(['"]\/admin-login['"]\)/);
  });

  it('endpoint datanya ikut diperiksa, bukan cuma halamannya', () => {
    expect(
      route,
      '/api/transparency terbuka lagi - gerbang halaman jadi hiasan, data tetap bisa diambil langsung',
    ).toMatch(/if\s*\(\s*!\s*await isAdminFromRequestCookies[\s\S]{0,80}?throw new ForbiddenError\(\)/);
  });

  it('endpoint bersesi tidak boleh di-cache CDN sebagai publik', () => {
    // Invarian keamanan, bukan performa - lihat __tests__/public-cache-headers.test.ts.
    expect(route).not.toContain('publicCacheHeaders');
  });

  it('rutenya tidak diiklankan ke crawler maupun dibuka untuk tamu', () => {
    expect(sitemap).not.toContain('transparency');
    expect(proxy, 'proxy masih memperlakukan /transparency sebagai halaman tamu').not.toContain('/transparency');
  });

  it('menu Transparansi hanya ada di grup Admin sidebar', () => {
    const adminGroup = sidebar.slice(sidebar.indexOf('ADMIN_NAV_GROUP'));
    const userNav = sidebar.slice(0, sidebar.indexOf('ADMIN_NAV_GROUP'));
    expect(adminGroup).toContain("path: '/admin/transparency'");
    expect(
      userNav,
      'Transparansi kembali ke navigasi pengguna - tamu dan user biasa tidak seharusnya melihatnya',
    ).not.toContain('transparency');
  });
});
