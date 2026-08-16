import { describe, expect, it } from 'vitest';
import { scoreWithAvailableComponents } from '../intraday-research.service';
import { INTRADAY_COMPONENT_KEYS, type IntradayWeights } from '../../constants/intraday-model';

function equalWeights(): IntradayWeights {
  const weight = 100 / INTRADAY_COMPONENT_KEYS.length;
  return {
    momentum: weight,
    vwapDeviation: weight,
    volumeSurge: weight,
    rangePosition: weight,
    trendPersistence: weight,
  };
}

describe('scoreWithAvailableComponents', () => {
  it('renormalizes observed components instead of inventing neutral 50', () => {
    const [a, b] = INTRADAY_COMPONENT_KEYS;
    expect(scoreWithAvailableComponents(equalWeights(), { [a]: 80, [b]: 40 })).toBeCloseTo(60, 8);
  });

  it('fails closed when there are no valid components', () => {
    expect(scoreWithAvailableComponents(equalWeights(), {})).toBeNull();
    const [a] = INTRADAY_COMPONENT_KEYS;
    expect(scoreWithAvailableComponents(equalWeights(), { [a]: Number.NaN })).toBeNull();
  });

  it('ignores scores outside the valid 0..100 domain', () => {
    const [a, b] = INTRADAY_COMPONENT_KEYS;
    expect(scoreWithAvailableComponents(equalWeights(), { [a]: 120, [b]: 70 })).toBeCloseTo(70, 8);
  });
});
