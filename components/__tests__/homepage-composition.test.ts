import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Beranda harus terbaca editorial, bukan sebagai papan kartu berbobot setara (PRD SEC.8,
 * SEC.11).
 *
 * Terukur 20 Agustus 2026, sebelum fase 3: sepuluh `<Card>` dan 27 ukuran font arbitrer
 * tersebar di lima berkas beranda. Kartu sebanyak itu membuat setiap bagian menuntut
 * perhatian yang sama - dan ketika semuanya penting, tidak ada yang penting.
 *
 * Gerbang ini menjaga arah, bukan angka ajaib: batas kartu dipasang di bawah baseline
 * lama supaya kemunduran terdeteksi, sementara ruang untuk kartu yang MEMANG objek
 * (upgrade prompt, kartu identitas) tetap ada.
 */
const ROOT = path.resolve(__dirname, '../..');

const BERANDA = [
  'components/HomeWorkspace.tsx',
  'components/home/HomeTodayBrief.tsx',
  'components/home/HomeBrandHero.tsx',
  'components/home/HomeCalendarWatchlist.tsx',
  'components/home/MarketPulseVisuals.tsx',
];

/** Baseline sebelum fase 3. Angka ini hanya boleh turun. */
const KARTU_SEBELUM_V3 = 10;
const BATAS_KARTU = 5;

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

function hitungKartu(): number {
  return BERANDA.reduce((total, rel) => total + (baca(rel).match(/<Card[\s>]/g) ?? []).length, 0);
}

describe('komposisi beranda', () => {
  it('pemindainya benar-benar membaca berkas beranda', () => {
    // Kalau angka ini runtuh, pemindainya yang rusak - bukan berarti berandanya bersih.
    const total = BERANDA.reduce((n, rel) => n + baca(rel).length, 0);
    expect(total).toBeGreaterThan(20_000);
  });

  it('densitas kartu turun jauh dari baseline V2', () => {
    // PRD SEC.29: "Card density materially lower". Bukan nol - kartu tetap tepat untuk
    // objek yang berdiri sendiri dan bisa ditindak.
    const kartu = hitungKartu();
    expect(kartu, `beranda memakai ${kartu} <Card>, baseline sebelum V3 adalah ${KARTU_SEBELUM_V3}`)
      .toBeLessThanOrEqual(BATAS_KARTU);
  });

  it.each(BERANDA)('%s tidak mengarang ukuran font sendiri', (rel) => {
    const arbitrer = baca(rel).match(/text-\[[0-9.]+px\]/g) ?? [];
    expect(arbitrer, `${rel} masih memuat: ${arbitrer.join(', ')}`).toHaveLength(0);
  });

  it.each(BERANDA)('%s tidak memakai warna hex mati', (rel) => {
    const hex = baca(rel).match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? [];
    expect(hex, `${rel} masih memuat hex: ${hex.join(', ')}`).toHaveLength(0);
  });

  it('memakai primitif komposisi V3, bukan merakit ulang kepala bagian', () => {
    // Kalau beranda merakit sendiri eyebrow/judul/lede-nya, ritme antar bagian kembali
    // menjadi kebetulan - persis yang dibereskan fase 1.
    const semua = BERANDA.map(baca).join('\n');
    expect(semua).toContain('SectionHeader');
    expect(semua).toContain('MetricBand');
  });

  it('hierarki beranda mengikuti urutan PRD SEC.11', () => {
    // Hero -> snapshot pasar -> Hari Ini -> sisanya. Yang dijaga urutannya, bukan isinya.
    const workspace = baca('components/HomeWorkspace.tsx');
    const hero = workspace.indexOf('HomeBrandHero');
    const brief = workspace.indexOf('HomeTodayBrief');

    expect(hero, 'HomeBrandHero tidak ditemukan').toBeGreaterThan(-1);
    expect(brief, 'HomeTodayBrief tidak ditemukan').toBeGreaterThan(-1);
    expect(hero, 'hero harus mendahului blok Hari Ini').toBeLessThan(brief);
  });

  it('hero tidak memotong dropdown pencarian emiten', () => {
    const hero = baca('components/home/HomeBrandHero.tsx');
    expect(hero).toMatch(/<Card[\s\S]*?overflow="visible"/);
  });
});
