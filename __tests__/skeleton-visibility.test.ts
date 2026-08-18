import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SKELETON HARUS TERLIHAT DI KEDUA TEMA - dijaga tes, bukan ingatan.
 *
 * Dua kegagalan yang berlawanan arah pernah hidup berdampingan di satu gradien:
 *
 *   1. Warnanya hex mati bernuansa gelap (#101926 -> #1A2940 -> #101926). Begitu token
 *      palet menjadi peka-tema, mode terang merender balok hampir hitam di atas halaman
 *      putih - terukur 16,44:1 terhadap --lens-bg terang. Skeleton adalah hal PERTAMA
 *      yang dilihat pengunjung ber-OS mode terang, karena app/layout.tsx memilih tema
 *      dari prefers-color-scheme kalau belum ada preferensi tersimpan.
 *
 *   2. Basis gelapnya praktis identik dengan --lens-card (terukur 1,00:1), jadi di tema
 *      gelap kotaknya hanya terlihat karena sheen-nya BERGERAK. Gerakan itu dimatikan
 *      untuk pengguna prefers-reduced-motion oleh aturan universal di globals.css -
 *      artinya justru mereka yang mendapat placeholder tak terlihat sama sekali.
 *
 * Perbaikan naifnya (memakai satu token --lens-card untuk kedua tema) menyelesaikan
 * yang pertama sambil MENGULANG yang kedua secara terbalik: putih di atas putih. Karena
 * itu invariannya diperiksa langsung, bukan dipercayakan pada pilihan token yang terasa
 * benar: basis harus berbeda cukup dari permukaan tempat ia duduk, di tema mana pun.
 */

type Rgb = [number, number, number];

const SURFACES = ['card', 'bg'] as const;

// Ambang di bawah nilai terukur saat ini (kartu 1,14 gelap / 1,39 terang), jadi
// penyetelan kecil pada token tidak memicu kegagalan palsu - tetapi memakai satu token
// yang sama dengan permukaannya (1,00) gagal telak, dan itulah regresi yang dijaga.
const MIN_BASE_VS_SURFACE = 1.08;
// Sheen harus terbaca sebagai sapuan, bukan getaran. 1,25 memisahkannya dari sekadar
// beda pembulatan sambil tetap di bawah nilai terukur (1,46 gelap / 1,32 terang).
const MIN_SHEEN_VS_BASE = 1.25;

function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function parseTriples(block: string): Record<string, Rgb> {
  const out: Record<string, Rgb> = {};
  const re = /--lens-([a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  return out;
}

/** `--lens-skeleton-base: rgb(var(--lens-hover));` -> `hover` */
function parseSkeletonRefs(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--lens-skeleton-(base|sheen):\s*rgb\(var\(--lens-([a-z-]+)\)\)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out[m[1]] = m[2];
  return out;
}

function loadThemes() {
  const css = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8');
  // Selektornya yang dicari, bukan teks "html.light" - kata itu juga muncul di dalam
  // komentar, dan memotong di sana membuat blok gelap kehilangan isinya tanpa error.
  const lightStart = css.indexOf('html.light {');
  expect(lightStart, 'blok html.light harus ada di globals.css').toBeGreaterThan(-1);
  const lightEnd = css.indexOf('\n}', lightStart);

  const darkBlock = css.slice(0, lightStart);
  const lightBlock = css.slice(lightStart, lightEnd);

  // Mode terang hanya MENIMPA sebagian token; sisanya diwarisi dari :root.
  return {
    dark: { tokens: parseTriples(darkBlock), refs: parseSkeletonRefs(darkBlock) },
    light: {
      tokens: { ...parseTriples(darkBlock), ...parseTriples(lightBlock) },
      refs: { ...parseSkeletonRefs(darkBlock), ...parseSkeletonRefs(lightBlock) },
    },
  };
}

describe('shimmer skeleton', () => {
  const themes = loadThemes();

  it('komponen Skeleton memakai kelas bertema, bukan gradien hex mati', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components', 'ui', 'Skeleton.tsx'),
      'utf8',
    );
    expect(source).toContain('lens-skeleton');
    expect(source, 'hex mati mengunci skeleton ke satu tema').not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  for (const theme of ['dark', 'light'] as const) {
    const { tokens, refs } = themes[theme];

    it(`tema ${theme}: kedua stop skeleton menunjuk token palet yang ada`, () => {
      for (const stop of ['base', 'sheen'] as const) {
        expect(refs[stop], `--lens-skeleton-${stop} harus didefinisikan untuk ${theme}`).toBeDefined();
        expect(tokens[refs[stop]], `--lens-${refs[stop]} tidak ada di palet ${theme}`).toBeDefined();
      }
    });

    for (const surface of SURFACES) {
      it(`tema ${theme}: basis skeleton terlihat di atas --lens-${surface} walau diam`, () => {
        const ratio = contrast(tokens[refs.base], tokens[surface]);
        expect(
          ratio,
          `basis (--lens-${refs.base}) vs --lens-${surface} = ${ratio.toFixed(3)}:1`,
        ).toBeGreaterThanOrEqual(MIN_BASE_VS_SURFACE);
      });
    }

    it(`tema ${theme}: sheen terbaca sebagai sapuan di atas basisnya`, () => {
      const ratio = contrast(tokens[refs.sheen], tokens[refs.base]);
      expect(
        ratio,
        `sheen (--lens-${refs.sheen}) vs basis (--lens-${refs.base}) = ${ratio.toFixed(3)}:1`,
      ).toBeGreaterThanOrEqual(MIN_SHEEN_VS_BASE);
    });
  }
});
