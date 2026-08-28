import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Penjaga ini lahir dari 2026-08-23: `verify:prod` dijalankan dari /opt/sahamlens/app,
 * rantainya memuat `npm run build`, dan `next build` menimpa .next/ yang sedang dibaca
 * `next start` yang melayani pengguna. BUILD_ID berganti di disk tanpa restart.
 *
 * Yang paling gampang rusak di sini BUKAN logikanya - itu enam baris perbandingan path -
 * melainkan dua hal di sekitarnya: pemasangannya di `verify:prod` (hilang begitu ada yang
 * merapikan skrip) dan pengecualian `build` (deploy memanggil build persis di direktori
 * itu; menjaganya berarti mematikan deploy). Keduanya dikunci di bawah.
 */

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'guard-production-checkout.mjs');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** Jalankan penjaga, kembalikan exit code + seluruh keluaran (stdout DAN stderr). */
function runGuard(env: Record<string, string> = {}) {
  // spawnSync, bukan execFileSync: jalur pintu darurat keluar dengan kode 0 tapi
  // memperingatkan lewat stderr, dan execFileSync hanya mengembalikan stdout - jadi
  // peringatan itu tidak akan pernah terlihat oleh test yang memeriksanya.
  const r = spawnSync('node', [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    // Default test harus merepresentasikan worktree biasa walau suite kebetulan dijalankan
    // dari checkout produksi. Test yang memang menguji produksi menimpa nilai ini lewat env.
    env: {
      ...process.env,
      SAHAMLENS_PRODUCTION_CHECKOUT: '/nonexistent/sahamlens-production-checkout',
      ...env,
    },
  });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

describe('penjaga checkout produksi', () => {
  it('terpasang di verify:prod, bukan skrip yatim', () => {
    // Harus PALING DEPAN. Ditaruh di belakang berarti seluruh rantai audit sudah
    // berjalan lebih dulu - dan `build`, yang justru bahayanya, ada di ujung rantai.
    expect(pkg.scripts?.['verify:prod']).toMatch(
      /^node scripts\/guard-production-checkout\.mjs &&/,
    );
  });

  it('skripnya benar-benar ada di lokasi yang dirujuk', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
  });

  it('TIDAK menjaga `build` maupun `prebuild` - deploy bergantung padanya', () => {
    // /usr/local/bin/deploy-sahamlens menjalankan `npm run build` persis di
    // /opt/sahamlens/app. Itu memang tugasnya: build lalu restart, rollback kalau gagal.
    // Kalau penjaga ini pernah merembes ke `build`, deploy produksi mati total.
    expect(pkg.scripts?.build ?? '').not.toContain('guard-production-checkout');
    expect(pkg.scripts?.prebuild ?? '').not.toContain('guard-production-checkout');
  });

  it('lolos di direktori kerja biasa', () => {
    // Keadaan normal: worktree, laptop, runner CI. Penjaga yang menolak di sini
    // akan memerahkan setiap PR.
    expect(runGuard().code).toBe(0);
  }, 30_000);

  it('menolak saat rootnya memang checkout produksi', () => {
    // Kalau ini pernah jadi hijau tanpa alasan, penjaganya sudah tidak menjaga apa pun.
    const { code, out } = runGuard({ SAHAMLENS_PRODUCTION_CHECKOUT: ROOT });
    expect(code).toBe(1);
    expect(out).toContain('DITOLAK');
  }, 30_000);

  it('menyebut jalan keluarnya, bukan cuma melarang', () => {
    // Larangan tanpa jalan keluar melahirkan kebiasaan menyunting penjaganya saat panik.
    const { out } = runGuard({ SAHAMLENS_PRODUCTION_CHECKOUT: ROOT });
    expect(out).toContain('git worktree add');
    expect(out).toContain('ALLOW_VERIFY_IN_PRODUCTION=1');
  }, 30_000);

  it('pintu daruratnya benar-benar membuka, dan tetap memperingatkan', () => {
    const { code, out } = runGuard({
      SAHAMLENS_PRODUCTION_CHECKOUT: ROOT,
      ALLOW_VERIFY_IN_PRODUCTION: '1',
    });
    expect(code).toBe(0);
    // Lolos diam-diam sama saja dengan tidak ada penjaga - restartnya harus disebut.
    expect(out).toContain('systemctl restart sahamlens');
  }, 30_000);
});
