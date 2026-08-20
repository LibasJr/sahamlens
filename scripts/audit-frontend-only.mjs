#!/usr/bin/env node
/**
 * Menolak perubahan backend selama Visual Redesign V3.
 *
 * KENAPA ADA. V3 mendarat lewat sembilan PR berturut-turut dengan satu aturan tunggal:
 * backend beku. Aturan yang hanya tertulis di PRD akan dilanggar tanpa ada yang
 * menyadarinya - biasanya oleh satu perubahan "kecil" di service saat sebuah tampilan
 * membutuhkan bentuk data yang sedikit berbeda. Kalau itu terjadi, PRD-nya sudah tidak
 * berlaku dan tidak ada yang tahu kapan berhentinya.
 *
 * Ini gerbang, bukan pengingat: kalau memang ada alasan sah menyentuh backend, ia memaksa
 * percakapan alih-alih diam.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const BEKU = [
  'app/api/',
  'modules/',            // repository & service; lihat PENGECUALIAN di bawah
  'database/migrations/',
  'shared/auth/',
  'shared/http/',
];

/** Bagian `modules/` yang murni presentasi tetap boleh disentuh. */
const PENGECUALIAN = [
  'modules/eligibility/presentation',
];

function berkasBerubah() {
  const arg = process.argv.indexOf('--files');
  if (arg !== -1 && process.argv[arg + 1]) {
    return process.argv[arg + 1].split('\n').filter(Boolean);
  }
  const base = process.env.FRONTEND_ONLY_BASE || 'origin/main';
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

// path.relative dan output git bisa memakai pemisah OS. Tanpa normalisasi, daftar
// ber-'/' di atas tidak pernah cocok di Windows dan gerbang ini lulus tanpa memeriksa.
const files = berkasBerubah().map((f) => f.split(path.sep).join('/'));

const pelanggar = files.filter((file) => {
  if (PENGECUALIAN.some((izin) => file.startsWith(izin))) return false;
  if (file.startsWith('modules/')) {
    return /\/(repository|service)\//.test(file);
  }
  return BEKU.some((beku) => beku !== 'modules/' && file.startsWith(beku));
});

console.log('SahamLens Frontend-Only Audit');
console.log(`Berkas diperiksa: ${files.length}`);

if (pelanggar.length > 0) {
  console.error('FAIL: Visual Redesign V3 membekukan backend, tetapi berkas berikut berubah:');
  for (const file of pelanggar) console.error(`  ${file}`);
  console.error('');
  console.error('Kalau sebuah ide visual menuntut backend: ubah idenya, bukan backend-nya.');
  console.error('Kalau perubahan ini memang perlu, keluarkan dari PR redesign dan bahas terpisah.');
  process.exit(1);
}

console.log('PASS: tidak ada berkas backend yang tersentuh.');
