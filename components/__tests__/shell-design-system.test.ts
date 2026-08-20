import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Shell aplikasi harus memakai sistem yang sudah dimiliki V2, bukan sistem keduanya
 * sendiri.
 *
 * Terukur 20 Agustus 2026, sebelum Redesign V3 fase 2: Sidebar, TopMarketBar, dan
 * MarketTicker memuat 4 warna hex mati dan 19 ukuran font arbitrer. Akibatnya bukan
 * sekadar tidak rapi - warna hex tidak ikut berubah saat tema berganti, dan setiap
 * `text-[10.5px]` adalah skala tipe tandingan yang membuat `lens-*` berhenti menjadi
 * kontrak.
 *
 * Gerbang ini menjaga angka itu tetap nol. Ia sengaja hanya menatap shell: permukaan lain
 * menyusul di fase berikutnya, dan gerbang yang menuntut seluruh repo sekaligus akan
 * dilonggarkan orang alih-alih dipenuhi.
 */
const ROOT = path.resolve(__dirname, '../..');

const SHELL = [
  'components/Sidebar.tsx',
  'components/TopMarketBar.tsx',
  'components/MarketTicker.tsx',
];

/** CLAUDE.md SEC.2: buang komentar dulu, atau prosa bisa meluluskan - atau menggagalkan -
 *  gerbang. Komentar di repo ini memang menyebut hex saat menjelaskan sejarahnya. */
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

describe('sistem desain shell', () => {
  it('pemindainya benar-benar membaca ketiga berkas', () => {
    // Kalau salah satu menyusut drastis, pemindainya yang rusak - bukan berarti shell
    // tiba-tiba bersih.
    for (const rel of SHELL) {
      expect(baca(rel).length, `${rel} terlalu pendek untuk shell`).toBeGreaterThan(2000);
    }
  });

  it.each(SHELL)('%s tidak memakai warna hex mati', (rel) => {
    // Hex mati tidak ikut berganti saat tema berubah, dan tidak terjangkau token.
    const hex = baca(rel).match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? [];
    expect(hex, `${rel} masih memuat hex: ${hex.join(', ')}`).toHaveLength(0);
  });

  it.each(SHELL)('%s tidak mengarang ukuran font sendiri', (rel) => {
    // Setiap text-[Npx] adalah skala tipe tandingan; begitu ada belasan, `lens-*`
    // berhenti menjadi kontrak dan menjadi saran.
    const arbitrer = baca(rel).match(/text-\[[0-9.]+px\]/g) ?? [];
    expect(arbitrer, `${rel} masih memuat ukuran arbitrer: ${arbitrer.join(', ')}`).toHaveLength(0);
  });

  it('label grup sidebar memakai peran eyebrow', () => {
    // PRD SEC.8 meminta label grup yang lebih tenang. Peran semantiknya sudah ada sejak
    // V2 - yang kurang cuma pemakaiannya.
    expect(baca('components/Sidebar.tsx')).toContain('lens-eyebrow');
  });

  it.each(SHELL)('%s memakai peran tipografi semantik', (rel) => {
    expect(baca(rel)).toMatch(/lens-(eyebrow|label|meta|metric|chip|body)/);
  });

  it('shell memakai token border, bukan putih transparan yang dirakit tangan', () => {
    const sidebar = baca('components/Sidebar.tsx');
    expect(sidebar).toContain('border-tv-border');
  });
});
