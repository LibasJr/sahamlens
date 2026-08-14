import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Penjaga, bukan uji perilaku.
//
// Bug "perubahan harian salah satu sesi" kembali TIGA KALI dalam satu hari
// (2026-08-13/14), tiap kali di file berbeda, karena tidak ada yang mencegahnya:
// perbaikan dilakukan di jalur yang dilaporkan, sementara jalur saudaranya yang
// menghitung kuantitas SAMA dengan cara sama tetap salah dan baru ketahuan setelah
// pengguna melihat angka terbalik di layar.
//
// Dua pola yang jadi penyebabnya:
//
//   1. `meta.previousClose` dari Yahoo dibaca langsung. Terukur: nilainya bisa
//      tertinggal berhari-hari (7 Agu untuk TLKM/ASII/BMRI saat 13 Agu).
//   2. `array[array.length - 2]` dipakai sebagai "penutupan kemarin", padahal array
//      itu sudah membuang bar ber-close null - dan bar sesi BERJALAN memang masih
//      null di Yahoo. Elemen terakhirnya sudah sesi kemarin, jadi length-2 menunjuk
//      dua sesi lalu, sementara harga yang dibandingkan adalah harga sesi berjalan.
//
// Satu-satunya tempat yang boleh memutuskan hal ini adalah resolvePreviousClose(),
// yang membandingkan TANGGAL BURSA, bukan posisi larik.
//
// Kalau test ini gagal karena kode baru: jangan tambahkan pengecualian tanpa
// membaca shared/market/previous-close.ts lebih dulu. Kalau memang benar-benar
// bukan perubahan harian (mis. dua titik MACD berurutan), daftarkan di
// DIIZINKAN di bawah beserta alasannya.

const ROOT = path.resolve(__dirname, '../../..');
const SCAN_DIRS = ['app', 'modules', 'shared', 'lib', 'components'];

/** Pemakaian [length-2] yang SUDAH ditinjau dan memang bukan perubahan harian. */
const DIIZINKAN = new Set([
  // Dua titik indikator berurutan untuk mendeteksi persilangan - bukan harga sesi.
  'lib/miniCouncil.ts:210',
  'lib/miniCouncil.ts:211',
  'modules/lens-radar/service/score-calibration.service.ts:290',
  'modules/technical/service/analyzers/swing-levels.ts:153',
  'modules/technical/service/analyzers/swing-levels.ts:154',
  // Riwayat navigasi UI, tidak ada hubungannya dengan harga.
  'components/SmartBackNavigation.tsx:105',

  // Berikut ini mengambil KEDUA sisi perbandingan dari larik yang SAMA, jadi tidak
  // bisa membalik arah seperti bug 2026-08-14 (yang mengadu harga sesi berjalan
  // dengan acuan dari larik yang sudah kehilangan bar sesi itu). Batasnya tetap ada
  // dan disebut di sini supaya tidak terlupa: kalau bar sesi berjalan tidak ada di
  // lariknya, yang tampil adalah perubahan sesi TERAKHIR YANG SELESAI, bukan hari ini.
  'modules/technical/service/analyzers/momentum-analyzer.ts:16', // delta 1 hari untuk skor momentum
  'modules/technical/service/analyzers/volume-analyzer.ts:16',   // arah harga untuk klasifikasi volume
  'modules/recommendation/service/breakout.service.ts:178',      // currentPrice-nya juga closes[last]
  'app/dashboard/page.tsx:54',                                   // candle terakhir vs sebelumnya
  'lib/miniCouncil.ts:96',                                       // badge indikator, larik closes yang sama
  'components/CommandPalette.tsx:111',                           // pratinjau hover, larik closes yang sama
]);

function daftarFile(dir: string): string[] {
  const out: string[] = [];
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      out.push(...daftarFile(rel));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

function baris(file: string): string[] {
  return fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
}

/** Baris komentar tidak dihitung - catatan sejarah justru wajib menyebut pola lamanya. */
function kode(line: string): boolean {
  const t = line.trim();
  return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
}

describe('penjaga penutupan sesi sebelumnya', () => {
  const files = SCAN_DIRS.flatMap(daftarFile);

  it('ada file untuk dipindai (penjaga tidak lulus karena kosong)', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('meta.previousClose hanya boleh dibaca lewat resolvePreviousClose', () => {
    const pelanggar: string[] = [];
    for (const file of files) {
      if (file.replace(/\\/g, '/').endsWith('shared/market/previous-close.ts')) continue;
      const lines = baris(file);
      // Dilewati kalau file memang meneruskannya SEBAGAI ARGUMEN ke helper.
      const meneruskanKeHelper = lines.some((l) => /metaPreviousClose\s*:/.test(l) || /metaChartPreviousClose\s*:/.test(l));
      lines.forEach((line, i) => {
        if (!kode(line)) return;
        if (!/\bmeta\??\.(previousClose|chartPreviousClose)\b/.test(line)) return;
        if (meneruskanKeHelper) return;
        pelanggar.push(`${file.replace(/\\/g, '/')}:${i + 1}`);
      });
    }
    expect(pelanggar, `Baca meta.previousClose lewat resolvePreviousClose():\n${pelanggar.join('\n')}`).toEqual([]);
  });

  it('tidak ada penutupan acuan yang diambil dari posisi larik [length - 2]', () => {
    const pelanggar: string[] = [];
    // Hanya yang benar-benar berbau harga penutupan - bukan setiap [length-2].
    const pola = /\b(prev|previous|prevClose|previousClose|lastClose|closes|history|candles|bars)\w*\s*\[\s*\w+\.length\s*-\s*2\s*\]/i;
    for (const file of files) {
      const lines = baris(file);
      lines.forEach((line, i) => {
        if (!kode(line)) return;
        if (!pola.test(line)) return;
        const id = `${file.replace(/\\/g, '/')}:${i + 1}`;
        if (DIIZINKAN.has(id)) return;
        pelanggar.push(id);
      });
    }
    expect(
      pelanggar,
      `Penutupan acuan tidak boleh ditentukan dari posisi larik - bar sesi berjalan bisa\n` +
      `terbuang lebih dulu sehingga acuannya mundur satu sesi. Pakai resolvePreviousClose().\n` +
      `Kalau baris ini memang bukan perubahan harian, daftarkan di DIIZINKAN:\n${pelanggar.join('\n')}`,
    ).toEqual([]);
  });
});
