import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

describe('desktop reliability and SahamLens visual identity', () => {
  it('ignores stale feature, calendar, and radar responses', () => {
    for (const file of [
      'desktop/src/components/FeatureWorkspace.tsx',
      'desktop/src/components/CalendarWorkspace.tsx',
      'desktop/src/components/RadarWorkspace.tsx',
    ]) {
      const source = read(file);
      expect(source).toContain('requestSequence');
      expect(source).toContain('requestId === requestSequence.current');
    }
  });

  it('clears a prior desktop token when saving a replacement token fails', () => {
    const api = read('desktop/src/api.ts');
    expect(api).toContain('await clearToken().catch(() => undefined);');
    expect(api).toMatch(/await saveToken\(payload\.token\);[\s\S]*?catch \(error\) \{[\s\S]*?await clearToken\(\)\.catch/);
  });

  it('shows recoverable failures for logout and server backtest presets', () => {
    const account = read('desktop/src/components/AccountModal.tsx');
    const backtest = read('desktop/src/components/BacktestWorkspace.tsx');

    expect(account).toContain('Logout gagal.');
    expect(backtest).toContain('Preset server belum dapat dimuat.');
    expect(account).toContain('{error && <p className="account-modal-error">{error}</p>}');
  });

  it('does not restore account data from an earlier auth state', () => {
    const main = read('desktop/src/main.tsx');
    expect(main).toContain('authSequence');
    expect(main).toContain('requestId === authSequence.current');
  });

  it('uses navy and indigo as the brand surface while reserving green for market meaning', () => {
    const polish = read('desktop/src/visual-polish.css');

    expect(polish).toContain('--ui-brand-navy:');
    expect(polish).toContain('--ui-brand-indigo:');
    expect(polish).toContain('linear-gradient(145deg,var(--ui-brand-navy),var(--ui-brand-indigo)');
    expect(polish).toContain('.account-modal{border-color:var(--ui-border-strong);background:radial-gradient(circle at 85% 0,rgba(56,189,248,.16),transparent 42%),linear-gradient(145deg,var(--ui-brand-navy),var(--ui-brand-indigo))}');
    expect(polish).toContain('--market-positive:#22c55e');
    expect(polish).not.toContain('background:#22c55e');
  });
});
