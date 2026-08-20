import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Halaman emiten adalah permukaan paling menentukan di V3 (PRD SEC.12, SEC.17): harga,
 * LensScore, sub-skor, kesegaran, dan temuan harus terbaca sebagai SATU komposisi.
 *
 * Yang dijaga di sini bukan seleranya, melainkan satu hal yang bisa salah diam-diam:
 * halaman ini sempat merakit sendiri baris temuan - panah, warna arah, dan teks sr-only -
 * padahal `InsightRow` sudah melakukannya sejak fase 1. Dua salinan aturan arah berarti
 * suatu saat panah di sini dan panah di tempat lain akan berbeda maknanya, dan tidak ada
 * yang menyadarinya sampai seseorang membandingkan dua halaman.
 */
const ROOT = path.resolve(__dirname, '../../..');
const HALAMAN = 'app/technical/[symbol]/page.tsx';

/** Baseline sebelum fase 4. Hanya boleh turun. */
const KARTU_SEBELUM_V3 = 8;
const BATAS_KARTU = 6;

function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function baca(): string {
  const full = path.join(ROOT, HALAMAN);
  expect(fs.existsSync(full), `${HALAMAN} hilang - pindahkan gerbangnya, jangan biarkan lulus`).toBe(true);
  return stripComments(fs.readFileSync(full, 'utf8'));
}

describe('komposisi halaman emiten', () => {
  const source = baca();

  it('pemindainya benar-benar membaca halamannya', () => {
    expect(source.length).toBeGreaterThan(15_000);
  });

  it('memakai InsightRow, bukan merakit ulang penanda arah', () => {
    expect(source).toContain('InsightRow');
    // Peta arah lokal adalah salinan kedua dari aturan yang sama.
    expect(source, 'ARAH_PENANDA masih ada - aturan arah kini milik InsightRow').not.toContain('ARAH_PENANDA');
  });

  it('memakai SectionHeader untuk kepala bagian', () => {
    expect(source).toContain('SectionHeader');
    // Eyebrow yang dirakit tangan membuat ritme antar bagian kembali jadi kebetulan.
    const eyebrowTangan = source.match(/lens-meta mb-1(\.5)? font-bold uppercase tracking-\[0\.16em\]/g) ?? [];
    expect(eyebrowTangan, `masih ada ${eyebrowTangan.length} eyebrow rakitan tangan`).toHaveLength(0);
  });

  it('memakai StatusMeta untuk baris kepercayaan', () => {
    // Kesegaran dan coverage adalah konteks, dan bentuknya harus sama di setiap permukaan.
    expect(source).toContain('StatusMeta');
  });

  it('densitas kartu turun dari baseline V2', () => {
    const kartu = (source.match(/<Card[\s>]/g) ?? []).length;
    expect(kartu, `halaman emiten memakai ${kartu} <Card>, baseline sebelum V3 adalah ${KARTU_SEBELUM_V3}`)
      .toBeLessThanOrEqual(BATAS_KARTU);
  });

  it('tetap memanggil susunTemuanDimensi - temuan tidak boleh jadi narasi karangan', () => {
    // Invarian produk, bukan visual: tiap baris temuan harus bisa ditelusuri ke analyzer.
    expect(source).toContain('susunTemuanDimensi');
  });

  it('urutan tetap ringkasan lalu bukti', () => {
    const ringkasan = source.indexOf('Yang penting dari');
    const bukti = source.indexOf('Bukti & detail');
    expect(ringkasan).toBeGreaterThan(-1);
    expect(bukti).toBeGreaterThan(-1);
    expect(ringkasan, 'ringkasan harus mendahului bukti (PRD SEC.17)').toBeLessThan(bukti);
  });
});
