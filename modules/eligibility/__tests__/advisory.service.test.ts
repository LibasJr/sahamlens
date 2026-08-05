import { describe, it, expect } from 'vitest';
import { toAdvisoryDecision } from '../service/advisory.service';
import type { EligibilityResult, EligibilityStatus } from '../types/eligibility.types';

function elig(status: EligibilityStatus): EligibilityResult {
  return {
    status,
    reasonCodes: status === 'ELIGIBLE' ? [] : ['DUMMY_REASON'],
    blocking: status !== 'ELIGIBLE' && status !== 'LOW_LIQUIDITY',
    advisory: status === 'ELIGIBLE',
    message: status === 'ELIGIBLE' ? null : 'Tidak layak direkomendasikan.',
    details: {
      bars: 250, lastBarDate: '2026-08-05', calendarDaysSinceLastBar: 0,
      consecutiveZeroVolumeDays: 0, zeroVolumeDaysIn20: 0, adv20Idr: 1, coveragePct: 100,
    },
  };
}

const NON_ELIGIBLE: EligibilityStatus[] = [
  'INSUFFICIENT_DATA', 'INSUFFICIENT_HISTORY', 'STALE_DATA', 'POSSIBLY_NOT_TRADED', 'LOW_LIQUIDITY',
];

describe('toAdvisoryDecision - INVARIAN action !== null => ELIGIBLE', () => {
  it.each(NON_ELIGIBLE)('status %s TIDAK PERNAH menghasilkan BUY/STRONG BUY', (status) => {
    for (const kategori of ['STRONG BUY', 'BUY', 'HOLD', 'SELL'] as const) {
      const d = toAdvisoryDecision(kategori, elig(status));
      expect(d.action).toBeNull();
      expect(d.advisory).toBe(false);
    }
  });

  it.each(NON_ELIGIBLE)('status %s TIDAK di-default ke HOLD', (status) => {
    const d = toAdvisoryDecision('STRONG BUY', elig(status));
    expect(d.action).not.toBe('HOLD');
    expect(d.action).toBeNull();
  });

  it('status ELIGIBLE meneruskan kategori v1 apa adanya', () => {
    for (const kategori of ['STRONG BUY', 'BUY', 'HOLD', 'SELL'] as const) {
      const d = toAdvisoryDecision(kategori, elig('ELIGIBLE'));
      expect(d.action).toBe(kategori);
      expect(d.advisory).toBe(true);
      expect(d.explanation).toBeNull();
    }
  });

  it("'DATA TIDAK CUKUP' bukan rekomendasi walau eligibility ELIGIBLE", () => {
    const d = toAdvisoryDecision('DATA TIDAK CUKUP', elig('ELIGIBLE'));
    expect(d.action).toBeNull();
    expect(d.advisory).toBe(false);
    expect(d.reasonCodes).toContain('COVERAGE_BELOW_MIN');
  });

  it('kategori null/undefined => action null, bukan HOLD dan bukan crash', () => {
    expect(toAdvisoryDecision(null, elig('ELIGIBLE')).action).toBeNull();
    expect(toAdvisoryDecision(undefined, elig('ELIGIBLE')).action).toBeNull();
    expect(toAdvisoryDecision(undefined, elig('ELIGIBLE')).advisory).toBe(false);
  });

  it('alasan gerbang diteruskan supaya bisa ditampilkan, bukan ditelan diam-diam', () => {
    const d = toAdvisoryDecision('BUY', elig('LOW_LIQUIDITY'));
    expect(d.eligibilityStatus).toBe('LOW_LIQUIDITY');
    expect(d.reasonCodes).toContain('DUMMY_REASON');
    expect(d.explanation).toBeTruthy();
  });
});
