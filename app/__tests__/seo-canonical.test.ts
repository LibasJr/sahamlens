import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Gerbang canonical.
 *
 * KENAPA ADA. Next mewariskan metadata root ke setiap halaman anak yang tidak
 * menimpanya. `app/layout.tsx` pernah memuat `alternates: { canonical: '/' }`,
 * sehingga /screener, /news, /calendar, /about, /market-pulse, /breakout-radar,
 * /fundamental, /dcf, /moat, dan /dividend semuanya mengirim
 * <link rel="canonical" href="https://sahamlens.id"> - menyuruh mesin pencari
 * mengabaikan halaman itu dan mengindeks beranda sebagai gantinya. Sitemap
 * mendaftarkan 970 URL sementara canonical membatalkannya satu per satu.
 *
 * Terverifikasi di produksi 13 September 2026 sebelum perbaikan: sepuluh URL
 * publik memulangkan canonical beranda.
 */

const APP_DIR = path.join(process.cwd(), 'app');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(APP_DIR, relativePath), 'utf8');
}

/** Buang komentar sebelum mencocokkan pola (CLAUDE.md §2). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('canonical URL', () => {
  it('root layout TIDAK menetapkan canonical yang diwariskan ke semua halaman', () => {
    const source = stripComments(read('layout.tsx'));

    // Pola apa pun yang menetapkan canonical di root adalah regresi: nilainya
    // menurun ke setiap halaman yang tidak menimpanya.
    expect(source).not.toMatch(/alternates\s*:\s*\{[^}]*canonical/);
  });

  it('beranda menyatakan canonical-nya sendiri', () => {
    const source = stripComments(read('page.tsx'));
    expect(source).toMatch(/alternates\s*:\s*\{\s*canonical\s*:\s*'\/'\s*\}/);
  });

  // Halaman 'use client' TIDAK BISA mengekspor `metadata` - Next mengabaikannya
  // tanpa peringatan. Satu-satunya jalan adalah layout.tsx tipis di folder rute.
  const CLIENT_PAGES = ['screener', 'breakout-radar', 'market-pulse', 'news', 'calendar', 'about'];

  it.each(CLIENT_PAGES)('halaman client /%s punya layout dengan canonical sendiri', (slug) => {
    const layoutPath = path.join(APP_DIR, slug, 'layout.tsx');
    expect(fs.existsSync(layoutPath), `app/${slug}/layout.tsx wajib ada`).toBe(true);

    const source = stripComments(fs.readFileSync(layoutPath, 'utf8'));
    expect(source).toContain(`canonical: '/${slug}'`);
    expect(source).toMatch(/title\s*:/);
    expect(source).toMatch(/description\s*:/);
  });

  it.each(CLIENT_PAGES)('halaman /%s memang komponen client (alasan layout terpisah)', (slug) => {
    const source = read(path.join(slug, 'page.tsx'));
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('halaman server yang publik menetapkan canonical di metadata-nya', () => {
    const source = stripComments(read('transparency/page.tsx'));
    expect(source).toContain("canonical: '/transparency'");
  });
});

describe('judul halaman', () => {
  /**
   * Root layout memakai `template: '%s | SahamLens'`. Judul halaman yang menulis
   * sufiks itu sendiri membuatnya muncul DUA KALI:
   *   "Analisis Saham BBCA - Teknikal, Chart & Skor total | SahamLens | SahamLens"
   * Terukur di produksi 13 September 2026.
   */
  it('root layout memakai template sufiks', () => {
    const source = stripComments(read('layout.tsx'));
    expect(source).toContain("template: '%s | SahamLens'");
  });

  it('halaman ticker tidak menulis sufiks SahamLens sendiri', () => {
    const source = stripComments(read('technical/[symbol]/page.tsx'));

    // Ambil hanya nilai `title:` dan literal `const title = ...` di generateMetadata.
    const titleValues = [
      ...source.matchAll(/title\s*:\s*'([^']*)'/g),
      ...source.matchAll(/const title = `([^`]*)`/g),
    ].map((match) => match[1]);

    // Penjaga jumlah: kalau pemindainya rusak, ia akan lulus tanpa memeriksa
    // apa pun - jauh lebih buruk daripada merah (CLAUDE.md §2).
    expect(titleValues.length).toBeGreaterThan(2);

    for (const value of titleValues) {
      expect(value, `judul "${value}" menduplikasi sufiks template`).not.toContain('| SahamLens');
    }
  });
});

describe('struktur heading', () => {
  /**
   * Header aplikasi tampil di SETIAP halaman. Sebagai <h1> ia beradu dengan judul
   * asli halaman: /technical/BBCA mengirim dua <h1> sekaligus, terukur di
   * produksi 13 September 2026.
   */
  it('Header memakai <p> untuk judul modul, bukan <h1>', () => {
    const source = stripComments(
      fs.readFileSync(path.join(process.cwd(), 'components', 'Header.tsx'), 'utf8'),
    );

    expect(source).not.toMatch(/<h1[\s>]/);
    expect(source).toMatch(/<p[^>]*>\{moduleTitle\}<\/p>/);
  });

  it('halaman ticker menyisakan tepat satu <h1>', () => {
    const source = stripComments(read('technical/[symbol]/page.tsx'));
    const headings = source.match(/<h1[\s>]/g) ?? [];
    expect(headings).toHaveLength(1);
  });
});
