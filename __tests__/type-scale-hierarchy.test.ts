import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Skala tipe harus benar-benar berjenjang.
 *
 * Terukur 20 Agustus 2026, setelah seluruh V3 mendarat dan tampilannya tetap terbaca sama:
 * `lens-section-title` berukuran 0.9375rem - ANGKA YANG SAMA PERSIS dengan `lens-body`.
 * Enam peran memampat di 12-20px dengan dua pasang identik, jadi judul bagian tidak pernah
 * memisahkan dirinya dari isi dan halaman terbaca rata.
 *
 * Itu kegagalan yang sulit dilihat dari kode: setiap komponen memakai peran yang BENAR,
 * dan tetap tidak ada hierarki. Gerbang ini menjaga jaraknya, bukan sekadar keberadaannya.
 */
const CSS = fs.readFileSync(path.resolve(__dirname, '..', 'app', 'globals.css'), 'utf8');

/** Ukuran font sebuah peran dalam rem, diambil dari deklarasi dasarnya (bukan @media). */
function remDasar(peran: string): number {
  const blok = CSS.slice(CSS.indexOf(`.${peran} {`));
  const cocok = blok.slice(0, 400).match(/font-size:\s*([\d.]+)rem/);
  expect(cocok, `font-size ${peran} tidak ditemukan`).not.toBeNull();
  return parseFloat(cocok![1]);
}

describe('hierarki skala tipe', () => {
  const hero = remDasar('lens-hero-title');
  const page = remDasar('lens-page-title');
  const section = remDasar('lens-section-title');
  const body = remDasar('lens-body');
  const bodySm = remDasar('lens-body-sm');
  const meta = remDasar('lens-meta');

  it('setiap tingkat benar-benar lebih besar dari tingkat di bawahnya', () => {
    expect(hero, 'hero harus di atas judul halaman').toBeGreaterThan(page);
    expect(page, 'judul halaman harus di atas judul bagian').toBeGreaterThan(section);
    expect(section, 'judul bagian harus di atas body').toBeGreaterThan(body);
    expect(body, 'body harus di atas body kecil').toBeGreaterThan(bodySm);
    expect(bodySm, 'body kecil harus di atas metadata').toBeGreaterThan(meta);
  });

  it('judul bagian cukup jauh dari body untuk terbaca sebagai judul', () => {
    // Inti kegagalannya: keduanya pernah 0.9375rem dan hanya dibedakan tebal huruf.
    // Perbedaan tebal saja tidak cukup memisahkan bagian pada halaman yang padat.
    expect(section / body, 'judul bagian terlalu dekat dengan ukuran body').toBeGreaterThanOrEqual(1.15);
  });

  it('hero benar-benar mendominasi', () => {
    expect(hero / body).toBeGreaterThanOrEqual(2);
  });

  it('skala melebar di layar besar, bukan membeku di ukuran ponsel', () => {
    const blokSm = CSS.slice(CSS.indexOf('@media (min-width: 640px) {'));
    expect(blokSm.slice(0, 600)).toMatch(/\.lens-hero-title\s*\{\s*font-size:\s*[\d.]+rem/);
    expect(blokSm.slice(0, 600)).toMatch(/\.lens-section-title\s*\{\s*font-size:\s*[\d.]+rem/);
  });
});
