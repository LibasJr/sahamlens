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
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, CRON_SECRET: '', ...env },
  });
}

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
