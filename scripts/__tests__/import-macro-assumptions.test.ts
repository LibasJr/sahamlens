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

function run(csv: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'macro-pit-'));
  tempDirs.push(dir);
  const file = path.join(dir, 'macro.csv');
  writeFileSync(file, csv, 'utf8');
  return spawnSync(process.execPath, ['scripts/import-macro-assumptions.mjs', '--file', file], {
    cwd: process.cwd(), encoding: 'utf8',
  });
}

const header = 'input_key,value_pct,market_date,observed_date,usable_from_date,evidence_type,source_tier,source_name,source_url,methodology,notes';

describe('macro PIT importer', () => {
  it('menerima external PIT evidence dan internal model policy tanpa source_url', () => {
    const result = run([
      header,
      'RISK_FREE_RATE_PCT,7.29,2026-07-21,2026-07-22,2026-07-22,MARKET_OBSERVATION,GOVERNMENT_OFFICIAL,Official,https://example.com/rf,SBN 10Y proxy,ok',
      'MAX_PERPETUAL_GROWTH_PCT,5,,2026-08-16,2026-08-16,MODEL_POLICY,INTERNAL_MODEL_POLICY,SahamLens,,Internal cap,ok',
    ].join('\n'));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Valid rows: 2. Mode: DRY RUN');
    expect(result.stdout).toContain('TIDAK mengubah MACRO_ASSUMPTIONS production');
  });

  it('menolak evidence yang baru diketahui setelah usable_from_date', () => {
    const result = run([
      header,
      'RISK_FREE_RATE_PCT,7.29,2026-07-21,2026-07-22,2026-07-21,MARKET_OBSERVATION,GOVERNMENT_OFFICIAL,Official,https://example.com/rf,SBN 10Y proxy,lookahead',
    ].join('\n'));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('observed_date > usable_from_date');
  });

  it('menolak sumber eksternal tanpa URL HTTPS', () => {
    const result = run([
      header,
      'EQUITY_RISK_PREMIUM_PCT,7.38,2026-01-05,2026-01-05,2026-01-05,RESEARCH_ESTIMATE,ACADEMIC_RESEARCH,Research,,ERP estimate,missing url',
    ].join('\n'));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('source_url HTTPS wajib');
  });
});
