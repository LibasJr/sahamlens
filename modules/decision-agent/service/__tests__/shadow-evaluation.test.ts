import { describe, expect, it } from 'vitest';
import { aggregateShadowCohorts } from '../shadow-evaluation';

describe('aggregateShadowCohorts', () => {
  it('menghitung cohort hanya dari horizon harga yang benar-benar tersedia', () => {
    const cohorts = aggregateShadowCohorts([
      { verdict: 'CONFIRM', t5: 10, t20: 5 },
      { verdict: 'CONFIRM', t5: -2, t20: null },
      { verdict: 'CHALLENGE', t5: null, t20: -4 },
    ]);
    expect(cohorts.find((item) => item.cohort === 'RULE_ALL')).toMatchObject({
      t5Count: 2, t5AverageReturnPct: 4, t5HitRatePct: 50,
      t20Count: 2, t20AverageReturnPct: 0.5, t20HitRatePct: 50,
    });
    expect(cohorts.find((item) => item.cohort === 'CONFIRM')).toMatchObject({
      t5Count: 2, t5AverageReturnPct: 4, t20Count: 1, t20AverageReturnPct: 5,
    });
    expect(cohorts.find((item) => item.cohort === 'NOT_REVIEWED')).toMatchObject({
      t5Count: 0, t5AverageReturnPct: null, t20HitRatePct: null,
    });
  });
});
