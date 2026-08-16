import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('import-bank-metric-evidence', () => {
  it('pilot official evidence lolos dry-run dan tetap DATA_ONLY', () => {
    const root = process.cwd();
    const out = execFileSync(process.execPath, [
      path.join(root, 'scripts/import-bank-metric-evidence.mjs'),
      '--file', path.join(root, 'data/financials/bank-metric-evidence-pilot-2026-08.csv'),
    ], { encoding: 'utf8' });
    expect(out).toContain('Evidence valid     : 12');
    expect(out).toContain('Ticker             : 4');
    expect(out).toContain('Reported / Derived : 12 / 0');
    expect(out).toContain('DATA_ONLY');
  });
});
