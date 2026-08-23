import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Preflight ini lahir dari 23 Agustus 2026: satu sesi menabrak empat jebakan yang SEMUANYA
 * sudah tertulis di CLAUDE.md. Prosa dibaca sekali di awal, lalu keadaan berubah di tengah
 * jalan dan tidak ada yang memeriksa ulang.
 *
 * Yang dijaga di sini bukan format keluarannya - itu boleh berubah - melainkan tiga hal yang
 * kalau hilang membuat preflight jadi hiasan: pemasangannya sebagai skrip npm, kemampuannya
 * MENANDAI keadaan berbahaya, dan sifatnya yang tidak boleh menggantung di jaringan.
 */

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'preflight.mjs');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function run(env: Record<string, string> = {}) {
  const r = spawnSync('node', [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    // Jaringan dimatikan di semua test: preflight yang butuh gh untuk lulus akan merah di
    // runner yang tidak login, dan itu memerahkan setiap PR.
    env: { ...process.env, SAHAMLENS_PREFLIGHT_SKIP_CI: '1', ...env },
  });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

describe('preflight agen', () => {
  it('terpasang sebagai `npm run preflight`', () => {
    // Skrip yang benar tapi tidak punya nama pendek tidak akan pernah dijalankan.
    expect(pkg.scripts?.preflight).toBe('node scripts/preflight.mjs');
  });

  it('skripnya ada di lokasi yang dirujuk', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
  });

  it('menjawab keenam pertanyaannya, bukan sebagian', () => {
    const { out } = run();
    for (const label of ['lokasi', 'branch', 'belum commit', 'HEAD', 'produksi', 'CI main']) {
      expect(out).toContain(label);
    }
  }, 30_000);

  it('lolos tenang di direktori kerja biasa', () => {
    // Keadaan normal - worktree, laptop, CI. Preflight yang memerah di sini akan diabaikan
    // dalam seminggu, dan preflight yang diabaikan sama saja dengan tidak ada.
    const { code } = run();
    expect(code).toBe(0);
  }, 30_000);

  /**
   * Repo git sungguhan berisi satu commit di branch yang BUKAN main.
   *
   * Versi pertama test ini memakai repo repo-nya sendiri dan menegaskan keluaran memuat
   * 'bukan main'. Itu lulus di PR - CI meng-checkout branch fitur - lalu GAGAL begitu
   * mendarat di main, karena di sana branch-nya memang `main` dan penandanya tidak pernah
   * muncul. `main` merah pada 8060da6, dan Deploy VPS ikut dilewati.
   *
   * Yang salah bukan assertion-nya melainkan pijakannya: hasil test ditentukan oleh keadaan
   * di luar dirinya. Sekarang branch-nya dibuat sendiri, jadi jawabannya sama di laptop, di
   * PR, dan di main.
   */
  function repoSementara(branch: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sahamlens-preflight-'));
    const git = (...args: string[]) =>
      spawnSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    git('init', '--quiet', '--initial-branch', branch);
    git('config', 'user.email', 'test@sahamlens.id');
    git('config', 'user.name', 'preflight test');
    fs.writeFileSync(path.join(dir, 'berkas.txt'), 'isi\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'commit awal');
    return dir;
  }

  it('menandai checkout produksi + branch bukan main, dan keluar 1', () => {
    // Kombinasi persis pukul 15:07 WIB: deploy menjalankan `git reset --hard` dan menarik
    // pointer branch fitur ke main.
    const repo = repoSementara('feat/contoh');
    const { code, out } = run({ SAHAMLENS_PREFLIGHT_REPO: repo, SAHAMLENS_PRODUCTION_CHECKOUT: repo });
    expect(out).toContain('CHECKOUT PRODUKSI');
    expect(out).toContain('bukan main');
    expect(code).toBe(1);
  }, 30_000);

  it('TIDAK menandai branch main - penanda itu soal branch fitur, bukan soal berada di produksi', () => {
    // Sisi lain dari kegagalan di atas, dan alasan test sebelumnya tidak boleh cuma
    // dilonggarkan: kalau `bukan main` muncul juga saat branch-nya main, penandanya
    // kehilangan arti dan yang di atas lulus tanpa membuktikan apa pun.
    const repo = repoSementara('main');
    const { out } = run({ SAHAMLENS_PREFLIGHT_REPO: repo, SAHAMLENS_PRODUCTION_CHECKOUT: repo });
    expect(out).toContain('CHECKOUT PRODUKSI');
    expect(out).not.toContain('bukan main');
  }, 30_000);

  it('menyebut worktree sebagai jalan keluarnya', () => {
    const repo = repoSementara('feat/contoh');
    const { out } = run({ SAHAMLENS_PREFLIGHT_REPO: repo, SAHAMLENS_PRODUCTION_CHECKOUT: repo });
    expect(out).toContain('git worktree add');
  }, 30_000);

  it('menandai produksi yang tidak menjalankan HEAD ini', () => {
    // Selisih inilah satu-satunya yang menunjukkan deploy no-op 14:36 WIB.
    const state = path.join(ROOT, 'node_modules', '.preflight-test-state');
    fs.writeFileSync(state, 'deadbee\n');
    try {
      const { out } = run({ SAHAMLENS_DEPLOY_STATE: state });
      expect(out).toContain('produksi TIDAK menjalankan HEAD ini');
    } finally {
      fs.rmSync(state, { force: true });
    }
  }, 30_000);

  it('tidak menggantung saat penanda produksi tidak ada', () => {
    // Di laptop dan di runner CI berkas itu memang tidak ada. Harus tetap selesai.
    const { code, out } = run({ SAHAMLENS_DEPLOY_STATE: '/nonexistent/deployed-sha' });
    expect(out).toContain('belum tercatat');
    expect(code).toBe(0);
  }, 30_000);
});
