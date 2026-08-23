#!/usr/bin/env node
/**
 * Menolak `verify:prod` kalau dijalankan DI DALAM checkout produksi.
 *
 * KENAPA ADA. Pada 2026-08-23 seluruh rantai `verify:prod` dijalankan dari
 * /opt/sahamlens/app untuk memvalidasi satu perubahan .gitignore. Rantai itu
 * memuat `npm run build`, dan `next build` menulis ke .next/ - .next/ YANG SAMA
 * yang sedang dibaca `next start` untuk melayani pengguna. BUILD_ID berganti di
 * disk sementara proses yang jalan masih memegang manifest lama di memori, jadi
 * permintaan chunk dengan hash lama tidak lagi punya berkasnya.
 *
 * Kali itu tidak ada gejala, dan alasannya kebetulan: perubahannya cuma
 * .gitignore, yang tidak menyentuh bundle, jadi hash chunk-nya identik. Kalau
 * yang diverifikasi adalah perubahan kode sungguhan - yaitu keadaan normal -
 * setiap pengguna yang sedang membuka aplikasi akan kena 404 pada chunk sampai
 * ada yang me-restart servisnya.
 *
 * CLAUDE.md §7 sudah menyatakan direktori itu checkout produksi dan menyarankan
 * `git worktree` untuk pekerjaan panjang. Yang belum ada adalah penegakannya:
 * peringatan berbentuk prosa hanya sekuat ingatan orang yang sedang buru-buru,
 * dan orang yang menjalankan `verify:prod` justru sedang buru-buru menutup
 * pekerjaan.
 *
 * YANG SENGAJA TIDAK DIJAGA: `npm run build` sendiri. Skrip deploy
 * (/usr/local/bin/deploy-sahamlens) memanggilnya persis di direktori ini, dan
 * itu memang tugasnya - build lalu restart, dengan rollback kalau gagal.
 * Menjaga `build` akan mematikan deploy. Yang berbahaya bukan membangun di sana,
 * melainkan membangun di sana TANPA restart yang menyusul.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Path checkout produksi. Bisa ditimpa supaya deployment lain punya jawabannya
// sendiri, dan supaya test bisa menunjuk direktori bikinan.
const PRODUCTION_CHECKOUT = process.env.SAHAMLENS_PRODUCTION_CHECKOUT ?? '/opt/sahamlens/app';

// Pintu darurat. Ada karena melarang tanpa jalan keluar hanya melahirkan
// kebiasaan menyunting berkas ini saat panik - dan itu lebih buruk daripada
// satu variabel yang menyatakan niat secara eksplisit.
const OVERRIDE = 'ALLOW_VERIFY_IN_PRODUCTION';

/** realpath supaya symlink dan `/opt/sahamlens/app/` tidak lolos sebagai path lain. */
function canonical(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

const here = canonical(ROOT);
const production = canonical(PRODUCTION_CHECKOUT);

if (here !== production) {
  process.exit(0);
}

if (process.env[OVERRIDE] === '1') {
  console.warn(
    `[guard-production-checkout] ${OVERRIDE}=1 - verify:prod diteruskan di checkout produksi.\n` +
      '  next build akan menimpa .next/ yang sedang dilayani. Restart servisnya setelah selesai:\n' +
      '    sudo systemctl restart sahamlens',
  );
  process.exit(0);
}

console.error(
  `\n[guard-production-checkout] verify:prod DITOLAK di ${here}\n\n` +
    'Direktori ini checkout produksi - aplikasi yang melayani pengguna dibangun dari sini.\n' +
    'Rantai verify:prod memuat `npm run build`, dan itu menimpa .next/ yang sedang dibaca\n' +
    'proses `next start` yang jalan. Hasilnya: BUILD_ID di disk berganti tanpa restart, dan\n' +
    'permintaan chunk dengan hash lama membalas 404 sampai servisnya di-restart.\n\n' +
    'Pakai worktree di luar direktori ini:\n\n' +
    '    git worktree add ~/wt-<nama> -b <branch>\n' +
    '    cd ~/wt-<nama> && npm ci && npm run verify:prod\n\n' +
    `Kalau memang disengaja - misalnya sedang memulihkan produksi dan restart sudah disiapkan -\n` +
    `jalankan dengan ${OVERRIDE}=1.\n`,
);
process.exit(1);
