import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRO_UI_ENABLED } from '../access';

/**
 * Fitur Pro BELUM ADA (keputusan produk 2026-08-23). Seluruh penyebutannya ke pengguna
 * dimatikan lewat satu konstanta, dan test ini menjaga dua hal berbeda:
 *
 *   1. default-nya benar-benar MATI - kalau seseorang mengubahnya jadi opt-out,
 *      Pro akan menyala di produksi tanpa ada yang memutuskan;
 *   2. tidak ada ajakan Pro baru yang lolos tanpa gerbang - ini yang paling mudah
 *      terjadi, karena menambah tombol "Upgrade" terasa seperti pekerjaan sepele.
 */

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const ROOT = path.join(__dirname, '..', '..', '..');
const files = ['app', 'components']
  .flatMap((dir) => walk(path.join(ROOT, dir)))
  .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`));

/**
 * Dua modal penjualan Pro menggerbang DIRINYA SENDIRI. Itu disengaja: ada 22 pemakaian
 * <PaywallModal> tersebar di 12 berkas, dan menggerbang tiap pemanggil berarti 22 tempat
 * yang bisa terlewat - satu saja lolos, modal pembelian muncul untuk produk yang belum ada.
 */
const MODAL_SWALAYAN = ['components/PaywallModal.tsx', 'components/PromoUpgradeModal.tsx'];

/**
 * Ajakan yang harus digerbang DI PEMANGGILNYA, karena berupa teks/tombol yang dirender
 * langsung, bukan komponen yang bisa menggerbang diri.
 */
const CTA_MARKERS = ['Upgrade ke Pro'];

const ungated: string[] = [];
let filesWithCta = 0;
for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (MODAL_SWALAYAN.includes(rel)) continue;
  const source = stripComments(fs.readFileSync(file, 'utf8'));
  if (!CTA_MARKERS.some((m) => source.includes(m))) continue;
  filesWithCta += 1;
  if (!source.includes('PRO_UI_ENABLED')) ungated.push(rel);
}

describe('tampilan Pro dimatikan sampai ada keputusan sebaliknya', () => {
  it('default MATI - menyalakannya wajib eksplisit lewat env', () => {
    expect(PRO_UI_ENABLED).toBe(false);
  });

  it('pemindainya benar-benar menemukan berkas untuk diperiksa', () => {
    // Kalau angka ini jatuh ke nol, pemindainya yang rusak - bukan berarti tidak ada bug.
    expect(files.length).toBeGreaterThan(50);
    expect(filesWithCta).toBeGreaterThanOrEqual(1);
  });

  it('kedua modal penjualan Pro menggerbang dirinya sendiri', () => {
    for (const rel of MODAL_SWALAYAN) {
      const source = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      expect(source, `${rel} tidak menggerbang dirinya`).toContain('if (!PRO_UI_ENABLED) return null;');
    }
  });

  it('setiap ajakan Pro yang dirender digerbang PRO_UI_ENABLED', () => {
    expect(ungated).toEqual([]);
  });

});
