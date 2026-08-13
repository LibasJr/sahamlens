import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * KONTRAS WARNA AKSEN - dijaga tes, bukan kewaspadaan.
 *
 * Sejarahnya: kontras palet ini sudah diperbaiki dua kali, dan dua-duanya berangkat dari
 * satu elemen yang kebetulan ditemukan (audit manual 2026-08-06, lalu laporan PageSpeed
 * 2026-08-13). Cara itu tidak pernah selesai - Lighthouse hanya memeriksa elemen yang
 * KEBETULAN terlihat saat ia menjalankan halaman. Contohnya nyata: laporan pertama
 * menggagalkan lencana MERAH (IHSG turun), laporan kedua di halaman yang sama
 * menggagalkan lencana HIJAU - bukan karena ada yang berubah, tapi karena pasarnya naik
 * hari itu. Warna lain (warning, gold, biru, ungu) tidak pernah tersampling sama sekali,
 * padahal terukur lebih parah.
 *
 * Tes ini memeriksa SELURUH matriks sekaligus, langsung dari nilai token di
 * app/globals.css - jadi kegagalan ketahuan saat mengubah warna, bukan berbulan-bulan
 * kemudian lewat screenshot pengguna.
 *
 * TIGA PERAN yang harus dipenuhi setiap warna aksen, dan ketiganya nyata dipakai di kode:
 *   1. teks polos di atas latar   (`text-tv-red` di atas kartu/halaman)
 *   2. teks di atas TINT-nya sendiri (`bg-tv-red/15 text-tv-red` - lencana, dipakai luas)
 *   3. teks kontras di atas bidang padat warna itu (`bg-tv-green` + teks on-accent)
 *
 * Peran kedua yang paling sering terlupa: tint mengangkat latar ke arah warna teksnya
 * sendiri, jadi ia MENURUNKAN kontras justru saat warnanya terasa "sudah aman".
 */

const AA_NORMAL_TEXT = 4.5;
// Tingkat tint yang benar-benar dipakai di kode: bg-tv-<warna> dengan alpha 10, 15, 20.
const TINT_LEVELS = [0.1, 0.15, 0.2];
const ACCENTS = ['green', 'red', 'yellow', 'warning', 'gold', 'blue', 'purple'] as const;

type Rgb = [number, number, number];

function parseTokens(block: string): Record<string, Rgb> {
  const out: Record<string, Rgb> = {};
  const re = /--lens-([a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
}

function loadPalettes() {
  const css = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8');
  // Dicari SELEKTORNYA (`html.light {`), bukan teks "html.light" - kata itu juga muncul
  // di dalam komentar penjelasan, dan memotong di sana membuat blok gelap kehilangan
  // seluruh warna aksennya tanpa satu pun error.
  const lightStart = css.indexOf('html.light {');
  expect(lightStart, 'blok html.light harus ada di globals.css').toBeGreaterThan(-1);
  const lightEnd = css.indexOf('\n}', lightStart);

  const dark = parseTokens(css.slice(0, lightStart));
  // Mode terang hanya MENIMPA sebagian token; sisanya diwarisi dari :root.
  const light = { ...dark, ...parseTokens(css.slice(lightStart, lightEnd)) };
  return { dark, light };
}

function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Warna hasil menumpuk `fg` beralpha `alpha` di atas `bg` - persis yang dilakukan `bg-tv-x/15`. */
function composite(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [0, 1, 2].map((i) => alpha * fg[i] + (1 - alpha) * bg[i]) as Rgb;
}

const { dark, light } = loadPalettes();
const THEMES = [
  { name: 'gelap', tokens: dark },
  { name: 'terang', tokens: light },
] as const;

describe.each(THEMES)('kontras tema $name', ({ name, tokens }) => {
  it.each(ACCENTS)('%s: teks polos di atas surface dan bg', (accent) => {
    for (const surfaceToken of ['surface', 'bg', 'card'] as const) {
      const ratio = contrast(tokens[accent], tokens[surfaceToken]);
      expect(ratio, `${name}/${accent} di atas ${surfaceToken} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    }
  });

  it.each(ACCENTS)('%s: teks di atas tint warnanya sendiri', (accent) => {
    // Pola `bg-tv-<warna>/<alpha> text-tv-<warna>`, dipakai di 33 berkas.
    for (const alpha of TINT_LEVELS) {
      const tinted = composite(tokens[accent], alpha, tokens.surface);
      const ratio = contrast(tokens[accent], tinted);
      expect(
        ratio,
        `${name}/${accent} di atas tint ${alpha * 100}% = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it.each(ACCENTS)('%s: teks kontras di atas bidang padat warna itu', (accent) => {
    const ratio = contrast(tokens['on-accent'], tokens[accent]);
    expect(ratio, `${name}/on-accent di atas ${accent} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  });
});

describe('warna hover tetap bisa dibedakan', () => {
  it.each([
    ['green', 'green-hover'],
    ['red', 'red-hover'],
    ['blue', 'blue-hover'],
  ])('%s vs %s', (base, hover) => {
    // Kalau hover berhimpit dengan warna dasarnya, umpan balik interaksi hilang tanpa
    // ada yang menyadarinya - dan itu mudah terjadi saat token digelapkan demi kontras.
    for (const { name, tokens } of THEMES) {
      const delta = Math.abs(relativeLuminance(tokens[base]) - relativeLuminance(tokens[hover]));
      expect(delta, `${name}: ${base} vs ${hover} terlalu mirip`).toBeGreaterThan(0.01);
    }
  });
});
