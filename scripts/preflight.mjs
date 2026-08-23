#!/usr/bin/env node
/**
 * Enam pertanyaan yang harus dijawab SEBELUM menyunting apa pun di repo ini.
 *
 * KENAPA ADA. 23 Agustus 2026 satu sesi menabrak empat jebakan berbeda dalam tiga jam -
 * semuanya sudah tertulis di CLAUDE.md, semuanya tetap kena. Pola kegagalannya sama: prosa
 * dibaca sekali di awal, lalu keadaan berubah di tengah jalan dan tidak ada yang memeriksa
 * ulang. Direktori kerja berpindah, branch berganti, produksi bergeser.
 *
 * Enam baris keluaran lebih sulit dilewatkan daripada dua ratus baris dokumen, dan bisa
 * dijalankan lagi kapan saja saat ragu.
 *
 * YANG DIPERIKSA, dan kenapa masing-masing pernah menggigit:
 *   1-2. lokasi + branch  -> deploy menjalankan `git reset --hard` yang tidak peduli branch
 *                            apa yang aktif. 15:07 WIB pointer sebuah branch fitur tertarik
 *                            ke main; selamat cuma karena commitnya sudah di-push.
 *   3.   belum di-commit  -> hilang tanpa peringatan pada deploy berikutnya.
 *   4-5. HEAD vs produksi -> 14:36 WIB deploy melapor SUKSES tanpa memindahkan versi apa pun.
 *                            Selisih dua angka ini satu-satunya yang menunjukkannya.
 *   6.   CI main          -> main merah berarti tidak ada informasi tentang kesehatan di
 *                            belakangnya sampai merahnya dibereskan.
 *
 * KELUAR DENGAN KODE 1 hanya untuk kombinasi yang benar-benar berbahaya: berada DI DALAM
 * checkout produksi sambil memegang sesuatu yang bisa hilang. Sisanya informasi - penjaga
 * yang memerah untuk hal yang normal akan diabaikan dalam seminggu.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Direktori yang diperiksa. Default: repo tempat skrip ini tinggal - itu yang benar untuk
// pemakaian sungguhan. Bisa ditunjuk ke tempat lain SUPAYA BISA DIUJI: tanpa ini test harus
// menumpang branch yang kebetulan aktif saat CI berjalan, dan itu persis yang memerahkan
// `main` pada 8060da6 - assertion 'bukan main' lulus di PR (branch fitur) lalu gagal di main
// (branch-nya memang main). Test yang hasilnya ditentukan oleh keadaan di luar dirinya bukan
// test.
const REPO = process.env.SAHAMLENS_PREFLIGHT_REPO ?? ROOT;
const PRODUCTION_CHECKOUT = process.env.SAHAMLENS_PRODUCTION_CHECKOUT ?? '/opt/sahamlens/app';
const STATE_FILE = process.env.SAHAMLENS_DEPLOY_STATE ?? '/opt/sahamlens/deployed-sha';

function sh(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      ...opts,
    }).trim();
  } catch {
    return '';
  }
}

function canonical(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

const here = canonical(REPO);
const inProduction = here === canonical(PRODUCTION_CHECKOUT);
const branch = sh('git', ['branch', '--show-current']) || '(detached)';
const dirty = sh('git', ['status', '--porcelain'])
  .split('\n')
  .filter(Boolean).length;
const head = sh('git', ['rev-parse', '--short', 'HEAD']);
const deployed = (() => {
  try {
    return fs.readFileSync(STATE_FILE, 'utf8').trim().slice(0, 7);
  } catch {
    return '';
  }
})();

// Panggilan jaringan, dan satu-satunya di sini. Dibuat best-effort: preflight yang
// menggantung karena gh lambat atau belum login lebih buruk daripada preflight tanpa baris
// ini - orang akan berhenti menjalankannya sama sekali.
const ciMain = process.env.SAHAMLENS_PREFLIGHT_SKIP_CI === '1'
  ? '(dilewati)'
  : sh(
      'gh',
      [
        'run', 'list', '--workflow=CI', '--limit', '5',
        '--json', 'headBranch,conclusion',
        '--jq', '[.[]|select(.headBranch=="main")][0].conclusion',
      ],
      { timeout: 15_000 },
    ) || '(tidak diketahui)';

const notes = [];
const flag = (cond, text) => (cond ? (notes.push(text), '  <-- ' + text) : '');

console.log('');
console.log('  Preflight SahamLens');
console.log('  ' + '-'.repeat(56));
console.log(`  1. lokasi        : ${here}${flag(inProduction, 'CHECKOUT PRODUKSI')}`);
console.log(
  `  2. branch        : ${branch}${flag(inProduction && branch !== 'main', 'bukan main, di checkout produksi')}`,
);
console.log(
  `  3. belum commit  : ${dirty} berkas${flag(inProduction && dirty > 0, 'akan HILANG saat deploy')}`,
);
console.log(`  4. HEAD          : ${head || '(?)'}`);
console.log(
  `  5. produksi      : ${deployed || '(belum tercatat)'}${flag(
    Boolean(deployed) && Boolean(head) && deployed !== head,
    'produksi TIDAK menjalankan HEAD ini',
  )}`,
);
console.log(
  `  6. CI main       : ${ciMain}${flag(
    ciMain === 'failure',
    'main merah - kesehatan di belakangnya tidak diketahui',
  )}`,
);
console.log('');

if (inProduction) {
  console.log('  Direktori ini dibangun ulang oleh deploy dengan `git reset --hard`.');
  console.log('  Untuk menyunting, pakai worktree di luar sini:');
  console.log('');
  console.log('      git worktree add ~/wt-<nama> -b <branch>');
  console.log('');
}

if (notes.length === 0) {
  console.log('  Aman untuk mulai.');
  console.log('');
  process.exit(0);
}

console.log(`  ${notes.length} hal perlu diperhatikan (lihat tanda <-- di atas).`);
console.log('');

// Hanya kombinasi yang bisa MENGHILANGKAN pekerjaan yang memerahkan preflight. Produksi
// tertinggal atau main merah itu penting, tapi tidak menghapus apa pun - cukup ditandai.
const bisaHilang = inProduction && (dirty > 0 || branch !== 'main');
process.exit(bisaHilang ? 1 : 0);
