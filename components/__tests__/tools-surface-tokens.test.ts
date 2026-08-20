import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Permukaan alat (Screener, Watchlist, shell valuasi) memakai sistem token yang sama
 * dengan sisa aplikasi.
 *
 * Terukur sebelum fase 5b: 52 ukuran font arbitrer dan 5 warna hex mati. Hex-nya bukan
 * dekorasi - ia mewarnai badge sinyal Watchlist lewat `style` inline, jadi badge itu
 * TIDAK ikut berganti saat tema terang dinyalakan.
 */
const ROOT = path.resolve(__dirname, '../..');

const ALAT = [
  'components/screener/ScreenerResults.tsx',
  'app/watchlist/page.tsx',
  'components/TickerAnalysisShell.tsx',
];

function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function baca(rel: string): string {
  const full = path.join(ROOT, rel);
  expect(fs.existsSync(full), `${rel} hilang - pindahkan gerbangnya, jangan biarkan lulus`).toBe(true);
  return stripComments(fs.readFileSync(full, 'utf8'));
}

describe('token permukaan alat', () => {
  it('pemindainya benar-benar membaca ketiga berkas', () => {
    for (const rel of ALAT) {
      expect(baca(rel).length, `${rel} terlalu pendek`).toBeGreaterThan(1500);
    }
  });

  it.each(ALAT)('%s tidak mengarang ukuran font sendiri', (rel) => {
    const arbitrer = baca(rel).match(/text-\[[0-9.]+px\]/g) ?? [];
    expect(arbitrer, `${rel} masih memuat ${arbitrer.length} ukuran arbitrer`).toHaveLength(0);
  });

  it.each(ALAT)('%s tidak memakai warna hex mati', (rel) => {
    const hex = baca(rel).match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? [];
    expect(hex, `${rel} masih memuat hex: ${hex.join(', ')}`).toHaveLength(0);
  });

  it('badge sinyal Watchlist diwarnai kelas token, bukan style inline', () => {
    // Warna lewat `style={{ color: hex }}` tidak bisa dijangkau tema maupun token.
    const watchlist = baca('app/watchlist/page.tsx');
    expect(watchlist).toContain('scoreToneClass');
    expect(watchlist, 'badge masih memakai style inline').not.toMatch(/style=\{\{\s*backgroundColor:/);
  });

  it('sel tabel Screener memakai peran chip yang menjaga kepadatan', () => {
    // lens-chip berukuran sama dengan lens-meta tetapi line-height 1, jadi keterbacaan
    // naik tanpa menumbuhkan tinggi baris - yang justru membuat tabel padat terasa
    // longgar (lihat catatan .lens-chip di globals.css). PRD SEC.19 minta density ringkas.
    expect(baca('components/screener/ScreenerResults.tsx')).toContain('lens-chip');
  });

  it('kontrak tabel Screener tidak tersentuh', () => {
    // Kelas ini dipakai e2e/responsive-contract.spec.ts untuk MENGUKUR breakpoint tabel.
    // Kalau hilang, harness melempar - tapi gerbang di sini menyebut sebabnya lebih dulu.
    const screener = baca('components/screener/ScreenerResults.tsx');
    expect(screener).toContain('hidden md:block');
    expect(screener).toContain('md:hidden');
  });

  it('kontrak harga Watchlist di ponsel tidak tersentuh', () => {
    const watchlist = baca('app/watchlist/page.tsx');
    expect(watchlist).toContain('hidden sm:flex');
    expect(watchlist).toContain('sm:hidden');
  });
});
