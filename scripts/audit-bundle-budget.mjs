// ANGGARAN UKURAN BUNDLE KLIEN.
//
// Kenapa ini ada: pustaka berat masuk ke bundle satu impor pada satu waktu, dan tidak ada
// satu pun perubahan yang terasa seperti "membuat aplikasi berat". Yang terasa berat adalah
// akumulasinya, berbulan-bulan kemudian, pada perangkat yang tidak dimiliki siapa pun di tim.
// Pola impor dinamis untuk pustaka ekspor (jspdf/xlsx/html2canvas) sudah dikuasai repo ini
// sejak lama - yang belum ada hanyalah sesuatu yang menyadari saat pola itu tidak diikuti.
//
// Dua hal diperiksa, dan keduanya sengaja berupa BATAS ATAS yang boleh diturunkan, bukan
// angka yang harus dikejar:
//   1. Total seluruh chunk klien.
//   2. Chunk tunggal terbesar - satu berkas 1 MB itu masalah yang berbeda dari 40 berkas
//      25 KB, walau totalnya sama, karena satu berkas tidak bisa dimuat paralel.
//
// Dijalankan SETELAH `npm run build`. Tanpa .next/static/chunks skrip ini melewati diri
// sendiri (exit 0) supaya tidak menghalangi jalur kerja yang tidak melakukan build.

import fs from 'node:fs';
import path from 'node:path';

const CHUNKS_DIR = path.join(process.cwd(), '.next', 'static', 'chunks');

// Diukur pada 2026-08-19. SEBELUM recharts dibuat dinamis: total 7.168 KB. SESUDAH:
// 5.760 KB, terbesar 415 KB - turun 1,4 MB (~20%) hanya dari dua impor dinamis.
// Kepala ruangnya sengaja tipis (~4%): anggaran yang longgar tidak menahan apa pun, dan
// angka inilah yang membuat penurunan tadi tidak pelan-pelan kembali.
// Dinaikkan 6.000 -> 6.020 pada 2026-08-27 untuk UI watchlist/compare product flow:
// alert LensScore/confidence, mode Ringkas/Advanced, Share, dan export JSON dari data
// aktif. Sebelum menaikkan, compare sudah dipangkas dari framer-motion, icon tambahan,
// formatter freshness, dan feedback state supaya pertumbuhan hanya membayar fitur.
const TOTAL_BUDGET_KB = 6_020;
// Dinaikkan 440 -> 480 pada 2026-08-23, dan ini SATU-SATUNYA sebabnya: `xlsx` dipindah dari
// registry npm (0.18.5, dua advisory high tanpa tambalan selamanya) ke tarball resmi SheetJS
// 0.20.3. Chunk terbesar ikut naik 415 -> 469 KB - 0.20.3 memuat sendiri
// paket yang dulu terpisah (cfb, codepage, crc-32, ssf, ...), jadi pertumbuhannya perpindahan
// tempat, bukan fitur baru.
//
// Kenapa dibayar, bukan diakali: chunk ini di-import dinamis dan hanya dimuat saat tombol
// Ekspor diklik, jadi ia tidak menyentuh muatan awal satu halaman pun.
//
// TOTAL_BUDGET_KB SENGAJA TIDAK IKUT DINAIKKAN, dan itu perlu diketahui siapa pun yang
// membaca ini berikutnya: perpindahan yang sama menaikkan total 5.903 -> 5.970 KB, jadi
// sisa kepala ruang tinggal 30 KB (0,5%). Tambahan sekecil apa pun sesudah ini akan
// memerahkan gerbang total - dan itu memang maksudnya. Yang TIDAK boleh dilakukan saat itu
// terjadi adalah menaikkan angkanya supaya hijau; yang benar adalah membuat dinamis satu
// impor berat lagi, atau memakai tuas di bawah.
//
// Tuas kalau suatu saat 480 pun terlampaui: `xlsx/dist/xlsx.mini.min.js` (273 KB terminifikasi
// vs 930 KB build penuh) membuang parser format yang tidak dipakai repo ini - repo ini hanya
// MENULIS .xlsx. Harganya build UMD tanpa tipe di dua pemanggil; belum dibayar karena belum perlu.
const LARGEST_CHUNK_BUDGET_KB = 480;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

if (!fs.existsSync(CHUNKS_DIR)) {
  console.log('[bundle-budget] SKIP: .next/static/chunks belum ada. Jalankan `npm run build` dulu.');
  process.exit(0);
}

const files = walk(CHUNKS_DIR).map((file) => ({
  name: path.relative(CHUNKS_DIR, file),
  kb: fs.statSync(file).size / 1024,
}));

const totalKb = files.reduce((sum, f) => sum + f.kb, 0);
const largest = files.reduce((max, f) => (f.kb > max.kb ? f : max), { name: '-', kb: 0 });

const failures = [];
if (totalKb > TOTAL_BUDGET_KB) {
  failures.push(
    `Total chunk ${totalKb.toFixed(0)} KB melewati anggaran ${TOTAL_BUDGET_KB} KB ` +
      `(+${(totalKb - TOTAL_BUDGET_KB).toFixed(0)} KB).`,
  );
}
if (largest.kb > LARGEST_CHUNK_BUDGET_KB) {
  failures.push(
    `Chunk terbesar ${largest.name} ${largest.kb.toFixed(0)} KB melewati anggaran ` +
      `${LARGEST_CHUNK_BUDGET_KB} KB (+${(largest.kb - LARGEST_CHUNK_BUDGET_KB).toFixed(0)} KB).`,
  );
}

console.log(`[bundle-budget] ${files.length} chunk, total ${totalKb.toFixed(0)} KB, terbesar ${largest.kb.toFixed(0)} KB (${largest.name})`);
console.log('[bundle-budget] 5 chunk terbesar:');
for (const f of [...files].sort((a, b) => b.kb - a.kb).slice(0, 5)) {
  console.log(`  ${f.kb.toFixed(0).padStart(5)} KB  ${f.name}`);
}

if (failures.length > 0) {
  console.error('\n[bundle-budget] FAIL');
  for (const line of failures) console.error(`  - ${line}`);
  console.error(
    '\nKalau pertumbuhannya memang disengaja, naikkan anggaran di skrip ini DALAM commit yang\n' +
      'sama dengan penyebabnya - supaya keputusannya terbaca bersama alasannya, bukan\n' +
      'ditemukan berbulan-bulan kemudian sebagai angka yang entah kenapa jadi segitu.',
  );
  process.exit(1);
}

console.log('[bundle-budget] PASS');
