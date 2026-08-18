import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Impor broker EOD diuji lewat jalur --json dry-run: parsing dan penolakan baris cacat
// harus terbukti TANPA database, supaya aturan Zero Dummy (baris cacat ditolak, bukan
// ditambal) terjaga di CI yang tidak punya Postgres.

const SCRIPT = 'scripts/import-broker-market-daily.mjs';
let dir: string;

function runDryRun(extraArgs: string[] = []): any {
  const out = execFileSync(
    process.execPath,
    [SCRIPT, '--dir', dir, '--json', ...extraArgs],
    { cwd: process.cwd(), encoding: 'utf8' }
  );
  return JSON.parse(out.trim());
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broker-eod-test-'));
  fs.writeFileSync(
    path.join(dir, 'broker_2026-08-14.csv'),
    [
      'date,broker_code,broker_name,volume,value,frequency',
      '2026-08-14,XL,Stockbit Sekuritas Digital,10684759519,3356780270044,1083041',
      '2026-08-14,AK,UBS Sekuritas Indonesia,3534459468,2565265532110,226769',
      // Baris cacat - wajib DITOLAK, bukan diisi nilai default.
      '2026-08-14,,Tanpa Kode,1,1,1',
      '2026-08-14,ZZ,Volume Negatif,-5,10,1',
      'bukan-tanggal,QQ,Tanggal Rusak,1,1,1',
      // Duplikat broker pada tanggal sama.
      '2026-08-14,XL,Stockbit Sekuritas Digital,10684759519,3356780270044,1083041',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(dir, 'broker_2026-08-13.csv'),
    [
      'date,broker_code,broker_name,volume,value,frequency',
      '2026-08-13,CC,MANDIRI SEKURITAS,4544139700,2158939685500,286710',
    ].join('\n')
  );
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('import-broker-market-daily (dry run)', () => {
  it('menerima baris sah dan menolak baris cacat tanpa menambalnya', () => {
    const summary = runDryRun();
    expect(summary.mode).toBe('DRY_RUN');
    expect(summary.files).toBe(2);
    expect(summary.parsedRows).toBe(3);
    expect(summary.rejectedRows).toBe(4);
    expect(summary.brokers).toBe(3);
    expect(summary.insertedRows).toBeNull();
  });

  it('melaporkan rentang tanggal dan total nilai apa adanya dari CSV', () => {
    const summary = runDryRun();
    expect(summary.minTradeDate).toBe('2026-08-13');
    expect(summary.maxTradeDate).toBe('2026-08-14');
    expect(summary.dates).toBe(2);
    expect(summary.totalValue).toBe(3356780270044 + 2565265532110 + 2158939685500);
  });

  it('bisa dibatasi ke satu tanggal', () => {
    const summary = runDryRun(['--date', '2026-08-13']);
    expect(summary.files).toBe(1);
    expect(summary.parsedRows).toBe(1);
    expect(summary.minTradeDate).toBe('2026-08-13');
  });

  it('gagal keras kalau kolom wajib tidak ada, bukan menebak isinya', () => {
    const brokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'broker-eod-broken-'));
    fs.writeFileSync(
      path.join(brokenDir, 'broker_2026-08-14.csv'),
      'date,broker_code,volume\n2026-08-14,XL,1'
    );
    try {
      expect(() =>
        execFileSync(process.execPath, [SCRIPT, '--dir', brokenDir, '--json'], {
          cwd: process.cwd(),
          encoding: 'utf8',
          stdio: 'pipe',
        })
      ).toThrow(/kolom wajib "broker_name" tidak ada|kolom wajib/);
    } finally {
      fs.rmSync(brokenDir, { recursive: true, force: true });
    }
  });
});
