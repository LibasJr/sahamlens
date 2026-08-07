import { describe, expect, it } from 'vitest';
import { buildGenuineOosValidation, buildRetrospectiveWalkForward, LENS_RADAR_OOS_FREEZE_DATE } from '../walk-forward-validation.service';

const obs = (date: string, ticker: string, score: number, ret: number, exit = '2026-09-30') => ({
  ticker, signalDate: date, exitDateT20: exit, lensScore: score,
  bucket: score >= 80 ? '80-100' as const : score >= 70 ? '70-79' as const : score >= 60 ? '60-69' as const : '<60' as const,
  returnT20: ret,
});

describe('walk-forward validation', () => {
  it('tidak pernah menganggap histori sebelum freeze sebagai genuine OOS', () => {
    const rows = [obs('2026-08-01', 'AAA', 90, 4), obs('2026-08-02', 'BBB', 40, -2)];
    const out = buildGenuineOosValidation(rows, rows, { asOfDate: '2026-10-01' });
    expect(out.freezeDate).toBe(LENS_RADAR_OOS_FREEZE_DATE);
    expect(out.matureRawSamples).toBe(0);
    expect(out.status).toBe('WAITING_FOR_MATURITY');
  });

  it('retrospective folds diberi label non-genuine OOS', () => {
    const rows = Array.from({ length: 16 }, (_, i) => obs(`2026-0${(i % 7) + 1}-${String((i % 20) + 1).padStart(2, '0')}`, `T${i}`, i % 2 ? 85 : 40, i % 2 ? 2 : -1));
    const out = buildRetrospectiveWalkForward(rows, 4);
    expect(out.genuineOos).toBe(false);
    expect(out.method).toContain('retrospective');
  });
});
