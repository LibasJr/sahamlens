#!/usr/bin/env node
/**
 * Menolak build kalau node_modules tidak sinkron dengan package.json.
 *
 * KENAPA ADA. Pada 2026-08-19 build produksi di VPS gagal dengan tiga layar
 * "Module not found: Can't resolve 'swr'" dari app/dividend, app/earnings, dan
 * app/home. Tidak ada yang salah di repo - `swr` ada di package.json maupun di
 * package-lock.json - yang terjadi hanyalah `git pull && npm run build` tanpa
 * `npm ci` di antaranya, jadi node_modules di server masih dari sebelum
 * dependensi itu ditambahkan.
 *
 * Biaya sebenarnya dari kegagalan seperti itu bukan build yang gagal, melainkan
 * MENYESATKAN: pesannya menunjuk ke berkas sumber kita dan ke dokumentasi
 * Next.js, sehingga orang yang membacanya wajar menyangka kodenyalah yang rusak
 * dan mulai mencari di tempat yang salah. Satu pemeriksaan murah di depan
 * menukar itu dengan satu kalimat yang menyebut perintah yang harus dijalankan.
 *
 * DUA TINGKAT KERASNYA, sengaja dibedakan:
 *   - paket DEKLARASI yang tidak ada di disk  -> galat, build pasti gagal.
 *   - versi terpasang beda dari kunci lockfile -> peringatan saja. npm bisa
 *     menaikkan versi lain ke atas untuk menyelesaikan konflik bersarang, jadi
 *     ketidakcocokan di sini adalah sinyal "install-mu basi", bukan bukti rusak.
 *     Menjadikannya galat berarti memblokir build atas dasar tebakan.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// devDependencies ikut diperiksa: `next build` butuh typescript, tailwind, dan
// plugin postcss saat kompilasi, jadi devDep yang hilang menggagalkan build
// produksi sama persis seperti dependensi runtime yang hilang.
const declared = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
];

/** Versi tiap paket sesuai lockfile, dibaca dari entri top-level saja. */
function lockedVersions() {
  const lockPath = path.join(ROOT, 'package-lock.json');
  if (!fs.existsSync(lockPath)) return new Map();
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const map = new Map();
  for (const [key, value] of Object.entries(lock.packages ?? {})) {
    // Hanya "node_modules/<nama>" - entri bersarang seperti
    // "node_modules/a/node_modules/b" memang boleh berbeda versi.
    if (!key.startsWith('node_modules/')) continue;
    const name = key.slice('node_modules/'.length);
    if (name.includes('/node_modules/')) continue;
    if (value?.version) map.set(name, value.version);
  }
  return map;
}

const locked = lockedVersions();
const missing = [];
const stale = [];

for (const name of declared) {
  const manifest = path.join(ROOT, 'node_modules', name, 'package.json');
  if (!fs.existsSync(manifest)) {
    missing.push(name);
    continue;
  }
  const want = locked.get(name);
  if (!want) continue;
  let got;
  try {
    got = JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
  } catch {
    continue;
  }
  if (got !== want) stale.push(`${name}: terpasang ${got}, lockfile ${want}`);
}

if (stale.length > 0) {
  console.warn(`[deps] ${stale.length} paket berbeda versi dari lockfile:`);
  for (const line of stale.slice(0, 10)) console.warn(`  - ${line}`);
  if (stale.length > 10) console.warn(`  ... dan ${stale.length - 10} lagi`);
  console.warn('[deps] Jalankan `npm ci` kalau build berperilaku aneh.');
}

if (missing.length > 0) {
  console.error('');
  console.error(`[deps] ${missing.length} dependensi belum terpasang di node_modules:`);
  for (const name of missing) console.error(`  - ${name}`);
  console.error('');
  console.error('[deps] node_modules tertinggal dari package.json. Jalankan:');
  console.error('');
  console.error('    npm ci');
  console.error('');
  console.error('[deps] Build dihentikan di sini. Kalau diteruskan, webpack akan');
  console.error('[deps] melaporkannya sebagai "Module not found" di berkas sumber,');
  console.error('[deps] seolah-olah kodenya yang rusak.');
  process.exit(1);
}

console.log(`[deps] ${declared.length} dependensi terpasang lengkap.`);
