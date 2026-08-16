import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

describe('backfill Ownership Flow - format Balancepos KSEI', () => {
  it('membaca pipe delimiter, DD-MMM-YYYY, Total Local/Foreign dan hanya EQUITY', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ksei-ownership-'));
    tempDirs.push(dir);
    const file = path.join(dir, 'Balancepos20260731.txt');

    writeFileSync(
      file,
      [
        'Date|Code|Type|Sec. Num|Price|Local IS|Local CP|Total Local|Foreign IS|Foreign CP|Total Foreign|Total',
        // Local IS sengaja sangat kecil. Parser yang salah mengambil "Local IS" akan gagal test ini.
        '31-JUL-2026|AALI|EQUITY|1924689333|6875|10|20|700|30|40|300|1000',
        '31-JUL-2026|BBCA|EQUITY|1234567890|10000|1|2|600|3|4|400|1000',
        '31-JUL-2026|XYZB|BOND|999|100|1|1|90|1|1|10|100',
      ].join('\r\n'),
      'utf8'
    );

    const result = spawnSync(
      process.execPath,
      ['scripts/backfill-ownership-flow.mjs', '--file', file],
      { cwd: process.cwd(), encoding: 'utf8' }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Delimiter          : |');
    expect(result.stdout).toContain('Baris EQUITY valid : 2');
    expect(result.stdout).toContain('Non-EQUITY dilewati: 1');
    expect(result.stdout).toContain('Tanggal snapshot   : 2026-07-31');
    expect(result.stdout).toContain('AALI.JK');
    expect(result.stdout).toContain('local=70.0000%');
    expect(result.stdout).toContain('foreign=30.0000%');
    expect(result.stdout).toContain('DRY RUN - tidak ada yang ditulis ke database.');
  });

  it('menolak baris bila Total Local + Total Foreign tidak sama dengan Total', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ksei-ownership-'));
    tempDirs.push(dir);
    const file = path.join(dir, 'Balancepos20260731.txt');

    writeFileSync(
      file,
      [
        'Date|Code|Type|Sec. Num|Price|Total Local|Total Foreign|Total',
        '31-JUL-2026|AALI|EQUITY|1924689333|6875|700|300|999',
      ].join('\n'),
      'utf8'
    );

    const result = spawnSync(
      process.execPath,
      ['scripts/backfill-ownership-flow.mjs', '--file', file],
      { cwd: process.cwd(), encoding: 'utf8' }
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Baris EQUITY valid : 0');
    expect(result.stdout).toContain('Total Local + Total Foreign');
    expect(result.stderr).toContain('Tidak ada baris EQUITY sah');
  });
});
