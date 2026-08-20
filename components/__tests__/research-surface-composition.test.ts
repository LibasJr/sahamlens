import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Permukaan riset (Technical / Fundamental / Flow) harus terbaca sebagai satu produk
 * (PRD SEC.18), bukan tiga alat yang kebetulan menerima kode saham yang sama.
 *
 * Terukur sebelum fase 5a: 18 `<Card>` di dua berkas, dan dua permukaan gradien
 * dekoratif. Gradien dilarang PRD SEC.6 bukan karena selera - ia memberi bobot visual
 * pada wadah, sementara yang harus menonjol adalah angkanya.
 */
const ROOT = path.resolve(__dirname, '../..');

const PERMUKAAN = [
  'components/technical/TechnicalAnalysisSuite.tsx',
  'components/BandarFlowPro.tsx',
];

/** Baseline sebelum fase 5a. Hanya boleh turun. */
const KARTU_SEBELUM_V3 = 18;
const BATAS_KARTU = 12;

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

describe('komposisi permukaan riset', () => {
  it('pemindainya benar-benar membaca kedua berkas', () => {
    for (const rel of PERMUKAAN) {
      expect(baca(rel).length, `${rel} terlalu pendek`).toBeGreaterThan(4000);
    }
  });

  it('densitas kartu turun dari baseline V2', () => {
    const kartu = PERMUKAAN.reduce((n, rel) => n + (baca(rel).match(/<Card[\s>]/g) ?? []).length, 0);
    expect(kartu, `permukaan riset memakai ${kartu} <Card>, baseline sebelum V3 adalah ${KARTU_SEBELUM_V3}`)
      .toBeLessThanOrEqual(BATAS_KARTU);
  });

  it.each(PERMUKAAN)('%s tidak memakai gradien sebagai PERMUKAAN', (rel) => {
    // PRD SEC.6: gradien adalah pengecualian dekoratif, bukan permukaan bawaan. Di panel
    // riset ia memberi bobot pada wadah sementara yang harus menonjol adalah angkanya.
    //
    // Yang dilarang adalah gradien yang BERAKHIR di warna permukaan kartu - tanda bahwa ia
    // sedang mengecat wadah. Gradien pada elemen data (bar posisi 52 minggu memakai
    // hijau-kuning-biru untuk MENYANDIKAN posisi dalam rentang) bukan dekorasi dan tidak
    // ikut dilarang; melarangnya akan menghapus informasi, bukan hiasan.
    const permukaanGradien = baca(rel).match(/bg-gradient-to-\w+[^"]*to-tv-card/g) ?? [];
    expect(permukaanGradien, `${rel} masih mengecat wadah dengan gradien`).toHaveLength(0);
  });

  it.each(PERMUKAAN)('%s tidak mengarang ukuran font sendiri', (rel) => {
    const arbitrer = baca(rel).match(/text-\[[0-9.]+px\]/g) ?? [];
    expect(arbitrer, `${rel} masih memuat: ${arbitrer.join(', ')}`).toHaveLength(0);
  });

  it('deret level pivot dirender seragam, bukan campur kartu dan div', () => {
    // Tujuh level harga adalah SATU deret. Sebelumnya lima dibungkus <Card> dan dua
    // dirakit sebagai div ber-border, jadi sel yang setara terlihat berbeda bobotnya.
    const suite = baca('components/technical/TechnicalAnalysisSuite.tsx');
    const pivot = suite.slice(suite.indexOf('activePivots.r3'), suite.indexOf('activePivots.s3'));
    expect(pivot.length, 'blok pivot tidak ditemukan').toBeGreaterThan(200);
    expect(pivot, 'level pivot masih memakai <Card>').not.toContain('<Card');
  });

  it('warna support/resistance tetap konvensi level, bukan penilaian', () => {
    // Merah di sini berarti resistance dan hijau berarti support - konvensi chart, bukan
    // "buruk" dan "baik". Memaksanya ke tone positive/negative MetricBand akan mengubah
    // artinya, jadi deret ini sengaja TIDAK memakai primitif itu.
    const suite = baca('components/technical/TechnicalAnalysisSuite.tsx');
    expect(suite).toContain('text-tv-red');
    expect(suite).toContain('text-tv-green');
  });
});
