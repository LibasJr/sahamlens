import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/** Config turunan supaya test tidak pernah menulis ke reports/ milik repo. */
function configWith(overrides: Record<string, unknown> = {}) {
  const base = JSON.parse(readFileSync('config/weekly-maintenance.json', 'utf8'));
  const dir = mkdtempSync(path.join(tmpdir(), 'weekly-maintenance-'));
  tempDirs.push(dir);
  const file = path.join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({ ...base, reportDir: path.join(dir, 'out'), ...overrides }), 'utf8');
  return { file, reportDir: path.join(dir, 'out') };
}

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, ['scripts/weekly-maintenance.mjs', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    // Default test merepresentasikan worktree perawatan biasa walau suite dijalankan dari
    // /opt/sahamlens/app. Kasus produksi tetap bisa diuji dengan override eksplisit.
    env: {
      ...process.env,
      CRON_SECRET: '',
      SAHAMLENS_PRODUCTION_CHECKOUT: '/nonexistent/sahamlens-production-checkout',
      ...env,
    },
  });
}

describe('stage quality tidak mewarisi env produksi', () => {
  const runner = readFileSync('scripts/weekly-maintenance.mjs', 'utf8');

  /** Kunci yang dipertahankan runner saat menjalankan verify:prod. */
  const allowlist = (() => {
    const match = runner.match(/const QUALITY_ENV_KEEP = \[([\s\S]*?)\]/);
    expect(match, 'QUALITY_ENV_KEEP tidak ditemukan - runner-nya berubah, perbarui test ini').toBeTruthy();
    return [...(match?.[1] ?? '').matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
  })();

  /** Kunci env yang dipakai aplikasi, menurut kontraknya sendiri. */
  const appEnvKeys = readFileSync('.env.example', 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .map((line) => line.match(/^([A-Z_][A-Z0-9_]*)=/)?.[1])
    .filter((key): key is string => Boolean(key));

  it('membaca kontrak env yang cukup untuk diperiksa', () => {
    // Penjaga jumlah: kalau .env.example gagal diurai, test di bawah lulus tanpa
    // memeriksa apa pun - dan itu lebih buruk daripada merah (CLAUDE.md §2).
    expect(appEnvKeys.length).toBeGreaterThan(20);
    expect(allowlist.length).toBeGreaterThan(3);
  });

  it('menjalankan verify:prod dengan env bersih', () => {
    const call = runner.match(/id: 'verify-prod'[^;]*?\}\);/s)?.[0] ?? '';
    expect(call, "stage quality harus memakai cleanEnv - tanpa itu .env.production bocor ke npm test").toContain('cleanEnv: true');
  });

  it('tidak meloloskan satu pun kunci env aplikasi ke dalam gerbang', () => {
    // 23 Agustus 2026: REDIS_URL yang terwarisi membuat getOrCompute() membalas berita
    // nyata dari cache produksi, jadi vi.mock('@/modules/news') tidak pernah terpanggil
    // dan dua regresi chat gagal - untuk commit yang CI-nya hijau. Daftar putih ini yang
    // menahannya; kunci aplikasi apa pun di dalamnya membuka lagi jalur itu.
    const bocor = allowlist.filter((key) => appEnvKeys.includes(key));
    expect(bocor, `kunci env aplikasi tidak boleh ada di QUALITY_ENV_KEEP: ${bocor.join(', ')}`).toEqual([]);
  });
});

describe('config perawatan mingguan', () => {
  const config = JSON.parse(readFileSync('config/weekly-maintenance.json', 'utf8'));

  it('punya endpoint untuk diperiksa', () => {
    // Penjaga jumlah: kalau daftarnya jatuh ke nol, test di bawah lulus tanpa
    // memeriksa apa pun - dan itu lebih buruk daripada merah (CLAUDE.md §2).
    expect(config.dataRefresh.length).toBeGreaterThan(3);
  });

  it('hanya menembak route cron yang benar-benar ada', () => {
    // Drift di sini berarti job mingguan meng-GET 404 tiap Minggu tanpa ada yang sadar.
    for (const job of config.dataRefresh) {
      expect(job.path, `${job.path} harus berbentuk /api/cron/<nama>`).toMatch(/^\/api\/cron\/[a-z0-9-]+$/);
      const route = path.join('app', 'api', 'cron', job.path.split('/').pop() as string, 'route.ts');
      expect(existsSync(route), `route hilang untuk ${job.path}`).toBe(true);
    }
  });

  it('memakai method HTTP yang benar-benar di-export route-nya', () => {
    // Route /api/cron terbagi rata antara GET dan POST. Menembak yang salah membalas
    // 405 tiap Minggu subuh, dan 405 di laporan terbaca seolah endpointnya rusak -
    // bukan seolah config-nya yang salah. Kunci pasangannya di sini.
    for (const job of config.dataRefresh) {
      const route = path.join('app', 'api', 'cron', job.path.split('/').pop() as string, 'route.ts');
      const exported = new Set(
        [...readFileSync(route, 'utf8').matchAll(/export\s+(?:async\s+function|function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)]
          .map((match) => match[1]),
      );
      expect(job.method, `${job.path} butuh "method" eksplisit di config`).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/);
      expect(
        exported.has(job.method),
        `${job.path} dikonfigurasi ${job.method}, tapi route-nya hanya meng-export ${[...exported].sort().join(', ') || 'tidak ada handler'}`,
      ).toBe(true);
    }
  });

  it('menyetel batas waktu dan alasan untuk tiap endpoint', () => {
    for (const job of config.dataRefresh) {
      expect(job.timeoutSec, `${job.path} butuh timeoutSec`).toBeGreaterThan(0);
      expect(String(job.reason ?? ''), `${job.path} butuh alasan tertulis`).not.toHaveLength(0);
    }
  });

  it('tidak ikut terdaftar di manifest cron - job ini bukan route', () => {
    const manifest = JSON.parse(readFileSync('config/scheduled-jobs.json', 'utf8'));
    expect(manifest.jobs.some((job: { path: string }) => job.path.includes('weekly-maintenance'))).toBe(false);
  });
});

describe('runner perawatan mingguan', () => {
  it('menolak nama stage yang tidak dikenal', () => {
    const result = run(['--only=keamanan']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('stage tidak dikenal');
  }, 30_000);

  it('dry-run tidak menembak jaringan dan tidak menulis laporan', () => {
    const { file, reportDir } = configWith();
    const result = run([`--config=${file}`, '--dry-run']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DRY RUN');
    expect(result.stdout).toContain('dry-run: GET http://127.0.0.1:3001/api/cron/market-data-reconcile');
    expect(existsSync(reportDir)).toBe(false);
  }, 30_000);

  it('sync hanya jalan kalau diminta eksplisit', () => {
    const { file } = configWith();
    // Tanpa --sync, stage sync tidak boleh muncul: ia menjalankan `git reset --hard`.
    expect(run([`--config=${file}`, '--dry-run']).stdout).not.toContain('stage: sync');
    expect(run([`--config=${file}`, '--dry-run', '--sync']).stdout).toContain('sync/fetch');
  }, 30_000);

  it('--no-data melewati pembaruan data dan tetap menulis laporan', () => {
    const { file, reportDir } = configWith();
    const result = run([`--config=${file}`, '--only=data', '--no-data']);
    expect(result.status).toBe(0);
    const runs = readdirSync(reportDir);
    expect(runs).toHaveLength(1);
    const report = JSON.parse(readFileSync(path.join(reportDir, runs[0], 'report.json'), 'utf8'));
    expect(report.verdict).toBe('PASS');
    expect(report.dataRefreshEnabled).toBe(false);
    expect(report.steps[0].status).toBe('SKIP');
    expect(existsSync(path.join(reportDir, runs[0], 'report.md'))).toBe(true);
  }, 30_000);

  it('tanpa CRON_SECRET, stage data gagal keras (bukan diam-diam hijau)', () => {
    const { file } = configWith();
    const result = run([`--config=${file}`, '--only=data']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('CRON_SECRET kosong');
  }, 30_000);

  it('menolak verify:prod dan sync di dalam checkout produksi', () => {
    // Alasannya di CLAUDE.md §7: next build di checkout produksi menimpa .next/
    // yang sedang dilayani, dan pengguna kena chunk 404 sampai servis di-restart.
    const { file } = configWith();
    const result = run([`--config=${file}`, '--only=quality,sync', '--sync'], { SAHAMLENS_PRODUCTION_CHECKOUT: process.cwd() });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('ditolak di checkout produksi');
    expect(result.stdout).toContain('menolak sync di checkout produksi');
  }, 30_000);

  it('membuang laporan lama dan hanya menyimpan sebanyak keepReports', () => {
    const { file, reportDir } = configWith({ keepReports: 2 });
    mkdirSync(reportDir, { recursive: true });
    for (const old of ['2000-01-01T00-00-00', '2000-01-02T00-00-00', '2000-01-03T00-00-00']) {
      mkdirSync(path.join(reportDir, old), { recursive: true });
    }
    expect(run([`--config=${file}`, '--only=data', '--no-data']).status).toBe(0);
    const remaining = readdirSync(reportDir).sort();
    expect(remaining).toHaveLength(2);
    expect(remaining).not.toContain('2000-01-01T00-00-00');
  }, 30_000);
});

describe('runner yang ikut tersegarkan oleh sync menyerahkan sisa run ke versi barunya', () => {
  /**
   * Node membaca scripts/weekly-maintenance.mjs sekali, saat proses lahir. Stage `sync`
   * menimpanya di tengah jalan, tapi proses yang berjalan tetap memegang salinan lama -
   * jadi tanpa serah-terima, stage `sync` TIDAK PERNAH bisa mempengaruhi run yang
   * memuatnya, dan setiap perbaikan pada runner baru berlaku satu minggu kemudian.
   *
   * 23 Agustus 2026 itu terjadi sungguhan: worktree perawatan sudah berpindah ke commit
   * yang memuat #127, tapi run yang sama tetap menembak GET ke tiga route POST dan tetap
   * mewariskan .env.production ke `npm test`. Laporannya menuduh empat hal yang sudah
   * diperbaiki - kegagalan yang lebih buruk daripada merah biasa, karena ia menyalahkan
   * hal yang salah.
   *
   * Test ini membangun kejadian itu apa adanya: origin memegang runner yang berbeda dari
   * yang ada di disk saat proses lahir, lalu menuntut sisa stage-nya dijalankan oleh
   * versi origin - dalam SATU laporan yang tetap memuat langkah sync-nya.
   */
  function git(cwd: string, args: string[]) {
    const out = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (out.status !== 0) throw new Error(`git ${args.join(' ')} gagal: ${out.stderr}`);
    return out;
  }

  function buildRepo() {
    const dir = mkdtempSync(path.join(tmpdir(), 'weekly-maintenance-sync-'));
    tempDirs.push(dir);
    const origin = path.join(dir, 'origin.git');
    const work = path.join(dir, 'work');
    const reportDir = path.join(dir, 'out');
    git(dir, ['init', '--bare', '--initial-branch=main', origin]);
    mkdirSync(path.join(work, 'scripts'), { recursive: true });
    mkdirSync(path.join(work, 'config'), { recursive: true });

    const runner = readFileSync('scripts/weekly-maintenance.mjs', 'utf8');
    writeFileSync(path.join(work, 'scripts', 'weekly-maintenance.mjs'), runner, 'utf8');
    writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'tmp-maintenance', version: '1.0.0', private: true }), 'utf8');
    // npm ci menolak jalan tanpa lockfile, dan stage sync memanggilnya.
    writeFileSync(path.join(work, 'package-lock.json'), JSON.stringify({
      name: 'tmp-maintenance', version: '1.0.0', lockfileVersion: 3, requires: true,
      packages: { '': { name: 'tmp-maintenance', version: '1.0.0' } },
    }), 'utf8');
    writeFileSync(path.join(work, 'config', 'weekly-maintenance.json'), JSON.stringify({
      baseUrl: 'http://127.0.0.1:1', reportDir, keepReports: 5, dataRefresh: [],
    }), 'utf8');

    git(work, ['init', '--initial-branch=main']);
    git(work, ['config', 'user.email', 'test@example.com']);
    git(work, ['config', 'user.name', 'test']);
    git(work, ['remote', 'add', 'origin', origin]);
    git(work, ['add', '-A']);
    git(work, ['commit', '-m', 'runner versi lama']);
    git(work, ['push', '-q', 'origin', 'main']);

    // Versi baru HANYA di origin. Setelah reset, disk memegang versi lama - persis keadaan
    // saat timer systemd melahirkan prosesnya, sebelum stage sync berjalan.
    writeFileSync(path.join(work, 'scripts', 'weekly-maintenance.mjs'), `${runner}\n// penanda versi baru\n`, 'utf8');
    git(work, ['commit', '-am', 'runner versi baru']);
    git(work, ['push', '-q', 'origin', 'main']);
    git(work, ['reset', '--hard', 'HEAD~1']);

    return { work, reportDir };
  }

  function runIn(cwd: string, args: string[]) {
    return spawnSync(process.execPath, ['scripts/weekly-maintenance.mjs', ...args], {
      cwd, encoding: 'utf8', env: { ...process.env, CRON_SECRET: '' },
    });
  }

  it('menjalankan sisa stage dengan runner dari origin, dalam satu laporan utuh', () => {
    const { work, reportDir } = buildRepo();
    const before = readFileSync(path.join(work, 'scripts', 'weekly-maintenance.mjs'), 'utf8');
    expect(before).not.toContain('penanda versi baru');

    const result = runIn(work, ['--only=sync,deps', '--sync']);

    // Sync benar-benar menarik versi baru ke disk...
    expect(readFileSync(path.join(work, 'scripts', 'weekly-maintenance.mjs'), 'utf8')).toContain('penanda versi baru');
    // ...dan sisa run diserahkan kepadanya, bukan dijalankan oleh salinan lama di memori.
    expect(result.stdout, result.stdout + result.stderr).toContain('sisa stage dijalankan dengan versi baru');

    // Satu laporan, bukan dua setengah-setengah: langkah sync milik induk harus ikut.
    const stamps = readdirSync(reportDir);
    expect(stamps).toHaveLength(1);
    const report = JSON.parse(readFileSync(path.join(reportDir, stamps[0], 'report.json'), 'utf8'));
    const stages = report.steps.map((step: { stage: string }) => step.stage);
    expect(stages).toContain('sync');
    expect(stages).toContain('deps');
    expect(report.steps.filter((step: { id: string }) => step.id === 'npm-ci')).toHaveLength(1);
    // Berkas serah-terima tidak boleh tertinggal di laporan.
    expect(existsSync(path.join(reportDir, stamps[0], 'logs', 'handoff.json'))).toBe(false);
  }, 180_000);

  it('tidak menyerahkan apa pun kalau runner-nya tidak berubah', () => {
    const { work, reportDir } = buildRepo();
    // Samakan disk dengan origin lebih dulu: sync tidak akan mengubah berkas runner.
    git(work, ['fetch', '-q', 'origin', 'main']);
    git(work, ['reset', '--hard', 'origin/main']);

    const result = runIn(work, ['--only=sync,deps', '--sync']);
    expect(result.stdout).not.toContain('sisa stage dijalankan dengan versi baru');

    const stamps = readdirSync(reportDir);
    expect(stamps).toHaveLength(1);
    const report = JSON.parse(readFileSync(path.join(reportDir, stamps[0], 'report.json'), 'utf8'));
    expect(report.steps.filter((step: { id: string }) => step.id === 'npm-ci')).toHaveLength(1);
  }, 180_000);
});
