import { describe, expect, it } from 'vitest';
import {
  BASELINE_POLICY, evaluatePolicy, learnOfflinePolicy, policySelects, rewardOf,
  type LearningObservation,
} from '../offline-policy-learning';

function observation(index: number, overrides: Partial<LearningObservation> = {}): LearningObservation {
  return {
    observedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    ticker: `T${index}`,
    lensScore: 80,
    coveragePct: 65,
    riskReward: 2,
    technicalScore: 60,
    fundamentalScore: 60,
    flowScore: 60,
    t5ReturnPct: 2,
    t20ReturnPct: 5,
    ...overrides,
  };
}

describe('offline policy learning', () => {
  it('menghukum downside awal pada reward', () => {
    expect(rewardOf(observation(1, { t5ReturnPct: -4, t20ReturnPct: 5 }))).toBeCloseTo(0.3);
    expect(rewardOf(observation(1, { t5ReturnPct: 4, t20ReturnPct: 5 }))).toBeCloseTo(4.7);
  });

  it('menerapkan seluruh gate policy secara deterministik', () => {
    expect(policySelects(BASELINE_POLICY, observation(1))).toBe(true);
    expect(policySelects(BASELINE_POLICY, observation(1, { coveragePct: 54 }))).toBe(false);
    expect(policySelects(BASELINE_POLICY, observation(1, { riskReward: 1.49 }))).toBe(false);
  });

  it('menghitung cohort outcome tanpa mengubah observasi', () => {
    const rows = [observation(1), observation(2, { t20ReturnPct: -3 })];
    const metrics = evaluatePolicy(BASELINE_POLICY, rows);
    expect(metrics).toMatchObject({ sampleCount: 2, selectedCount: 2, hitRatePct: 50, downsideRatePct: 50 });
    expect(rows[1]?.t20ReturnPct).toBe(-3);
  });

  it('fail-closed saat sampel belum cukup', () => {
    const result = learnOfflinePolicy(Array.from({ length: 40 }, (_, index) => observation(index)));
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.promotionEligible).toBe(false);
    expect(result.challenger).toBeNull();
  });

  it('memakai split waktu 70/30 dan menahan policy yang overfit', () => {
    const rows = Array.from({ length: 100 }, (_, index) => observation(index, index < 70
      ? { lensScore: 82, coveragePct: 70, t20ReturnPct: 8 }
      : { lensScore: 82, coveragePct: 70, t20ReturnPct: -5 }));
    const result = learnOfflinePolicy(rows);
    expect(result.train.baseline.sampleCount).toBe(70);
    expect(result.validation.baseline.sampleCount).toBe(30);
    expect(result.status).toBe('BASELINE_RETAINED');
    expect(result.promotionEligible).toBe(false);
  });

  it('hanya menandai challenger siap bila out-of-sample mengalahkan baseline', () => {
    const rows = Array.from({ length: 100 }, (_, index) => {
      const strong = index % 2 === 0;
      return observation(index, strong
        ? { lensScore: 82, coveragePct: 70, riskReward: 2, t20ReturnPct: 8, t5ReturnPct: 3 }
        : { lensScore: 76, coveragePct: 56, riskReward: 1.6, technicalScore: 40, fundamentalScore: 40, flowScore: 40, t20ReturnPct: -6, t5ReturnPct: -3 });
    });
    const result = learnOfflinePolicy(rows);
    expect(result.status).toBe('CHALLENGER_READY');
    expect(result.promotionEligible).toBe(true);
    expect(result.validation.challenger?.averageReward).toBeGreaterThan(result.validation.baseline.averageReward ?? Infinity);
  });
});
