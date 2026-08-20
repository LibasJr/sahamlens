import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Halaman admin memuat setiap panelnya dalam satu Promise.all. Satu promise yang reject
 * membuat seluruh halaman gugur ke app/error.tsx - jadi tabel yang belum dimigrasi di panel
 * paling pinggir menghilangkan Payment Order, Kesehatan Operasional, dan seluruh jalur
 * diagnosa sekaligus. Justru saat ada yang salah di server, halaman inilah yang dibutuhkan.
 *
 * Terjadi 20 Agustus 2026 (product_journey_events ter-deploy sebelum migrasi 010).
 *
 * Isolasinya cuma sekuat kebiasaan memanggil loadPanel. Panel berikutnya yang ditambahkan
 * orang yang sedang buru-buru akan ditulis persis seperti sebelumnya - kecuali ada yang
 * menggagalkannya.
 */

const ROOT = path.resolve(__dirname, '../../..');
const ADMIN_PAGE = path.join(ROOT, 'app', 'admin', 'page.tsx');

/** CLAUDE.md SEC.2: buang komentar dulu, atau prosa bisa meluluskan gerbang. */
function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function bacaHalamanAdmin(): string {
  expect(
    fs.existsSync(ADMIN_PAGE),
    'app/admin/page.tsx hilang - pindahkan gerbangnya, jangan biarkan lulus tanpa memeriksa',
  ).toBe(true);
  return stripComments(fs.readFileSync(ADMIN_PAGE, 'utf8'));
}

/** Pemuat data yang dipakai halaman admin. Dicari dari baris import, bukan ditulis tangan,
 *  supaya pemuat baru ikut terjaring tanpa ada yang perlu ingat memperbarui daftar ini. */
function pemuatYangDiimpor(source: string): string[] {
  const nama = new Set<string>();
  for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@\/modules\/[^']*'/g)) {
    for (const bagian of match[1].split(',')) {
      const bersih = bagian.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (/^(get|list|fetch|load)[A-Z]/.test(bersih)) nama.add(bersih);
    }
  }
  return [...nama];
}

describe('isolasi galat panel halaman admin', () => {
  const source = bacaHalamanAdmin();
  const pemuat = pemuatYangDiimpor(source);

  it('pemindainya benar-benar menemukan pemuat data untuk diperiksa', () => {
    // Kalau angka ini jatuh ke nol, pemindainya yang rusak - bukan berarti halamannya aman.
    expect(pemuat.length).toBeGreaterThan(3);
  });

  it.each(pemuat)('%s dipanggil lewat loadPanel, bukan langsung', (nama) => {
    const dipanggilLangsung = [...source.matchAll(new RegExp(`\\b${nama}\\s*\\(`, 'g'))].filter((match) => {
      const sebelum = source.slice(Math.max(0, match.index! - 60), match.index!);
      // Baris import bukan pemanggilan.
      if (/import\s*\{[^}]*$/.test(sebelum)) return false;
      return !sebelum.includes('loadPanel(');
    });

    expect(
      dipanggilLangsung.length,
      `${nama} dipanggil tanpa loadPanel - kegagalannya akan menjatuhkan seluruh halaman admin`,
    ).toBe(0);
  });

  it('tidak ada Promise.all yang memuat data mentah tanpa pembungkus', () => {
    const at = source.indexOf('await Promise.all([');
    expect(at, 'blok pemuatan data halaman admin tidak ditemukan').toBeGreaterThan(-1);
    const blok = source.slice(at, source.indexOf(']);', at));

    // Setiap baris berisi pemanggilan di dalam blok itu harus lewat loadPanel.
    const barisPemanggil = blok
      .split('\n')
      .map((baris) => baris.trim())
      .filter((baris) => baris.includes('(') && baris !== 'await Promise.all([');

    expect(barisPemanggil.length).toBeGreaterThan(3);
    for (const baris of barisPemanggil) {
      expect(baris, `baris tanpa loadPanel di blok pemuatan: ${baris}`).toContain('loadPanel(');
    }
  });

  it('setiap panel merender pesan kegagalannya sendiri', () => {
    // Tanpa ini, panel yang gagal bisa tampil sebagai panel KOSONG - dan kosong-karena-gagal
    // terbaca persis seperti kosong-karena-belum-ada-data, yaitu kesimpulan yang salah.
    const panel = [...source.matchAll(/(\w+Panel)\.message/g)].map((m) => m[1]);
    const dimuat = source.match(/const \[([^\]]+)\] = await Promise\.all/)?.[1] ?? '';
    const dideklarasikan = dimuat.split(',').map((n) => n.trim()).filter((n) => n.endsWith('Panel'));

    expect(dideklarasikan.length).toBeGreaterThan(3);
    for (const nama of dideklarasikan) {
      expect(panel, `${nama} tidak pernah merender pesan kegagalannya`).toContain(nama);
    }
  });
});
