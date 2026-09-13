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
  const CLIENT_PAGES = [
    'screener',
    'breakout-radar',
    'market-pulse',
    'news',
    'calendar',
    'about',
    'fundamental',
    'dcf',
    'moat',
    'dividend',
    'backtest',
  ];

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
   * Header aplikasi tampil di SETIAP halaman, jadi elemen judulnya tidak boleh
   * dipatok.
   *
   * SEJARAH. Versi pertama perbaikan ini mengubahnya menjadi <p> tanpa syarat
   * untuk membereskan dua <h1> di /technical/[symbol]. Akibatnya /screener dan
   * /fundamental - yang <h1>-nya HANYA berasal dari Header - kehilangan <h1>
   * sepenuhnya, dan e2e critical-path merah. Regresi itu lebih buruk daripada
   * masalah aslinya, dan gerbang versi pertama meluluskannya karena hanya
   * memeriksa Header.tsx tanpa menanyakan dampaknya ke halaman lain.
   *
   * Karena itu default WAJIB 'h1', dan halaman yang sudah punya <h1> sendiri
   * yang harus opt-in ke 'p'.
   */
  const headerSource = () =>
    stripComments(fs.readFileSync(path.join(process.cwd(), 'components', 'Header.tsx'), 'utf8'));

  it('Header memakai tag judul yang bisa dipilih pemanggil', () => {
    const source = headerSource();
    expect(source).toMatch(/titleAs\?\s*:\s*'h1'\s*\|\s*'p'/);
    expect(source).toMatch(/<ModuleTitleTag[^>]*>\{moduleTitle\}<\/ModuleTitleTag>/);
  });

  it("default titleAs adalah 'h1' supaya halaman tanpa judul sendiri tetap punya h1", () => {
    const source = headerSource();
    expect(source).toMatch(/titleAs\s*=\s*'h1'/);
  });

  it('halaman ticker menurunkan judul Header ke <p> karena sudah punya h1 sendiri', () => {
    const source = stripComments(read('technical/[symbol]/ClientHeader.tsx'));
    expect(source).toMatch(/titleAs="p"/);
  });

  it('halaman ticker menyisakan tepat satu <h1> di markup-nya sendiri', () => {
    const source = stripComments(read('technical/[symbol]/page.tsx'));
    const headings = source.match(/<h1[\s>]/g) ?? [];
    expect(headings).toHaveLength(1);
  });

  /**
   * Penjaga arah: HANYA halaman yang punya <h1> sendiri yang boleh opt-in ke 'p'.
   * Kalau ada pemanggil lain menambahkannya tanpa punya <h1> sendiri, halaman itu
   * akan kehilangan h1 seperti regresi di atas.
   */
  it('tidak ada halaman lain yang memakai titleAs="p" tanpa h1 sendiri', () => {
    const roots = ['app', 'components'];
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.tsx')) continue;

        const source = stripComments(fs.readFileSync(full, 'utf8'));
        if (!/titleAs\s*=\s*["']p["']/.test(source)) continue;

        // Normalkan pemisah path (CLAUDE.md §2) sebelum membandingkan.
        const rel = path.relative(process.cwd(), full).split(path.sep).join('/');
        // Pemakai sah: berada di folder rute yang page.tsx-nya punya <h1>.
        const pageFile = path.join(path.dirname(full), 'page.tsx');
        const hasOwnH1 =
          fs.existsSync(pageFile) && /<h1[\s>]/.test(stripComments(fs.readFileSync(pageFile, 'utf8')));
        if (!hasOwnH1) offenders.push(rel);
      }
    };

    for (const root of roots) walk(path.join(process.cwd(), root));

    expect(offenders, `titleAs="p" tanpa <h1> sendiri: ${offenders.join(', ')}`).toEqual([]);
  });
});
