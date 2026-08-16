import { describe, expect, it } from 'vitest';
import { evaluatePointInTimeUniverse } from '../point-in-time-universe';

function bars(n: number, close = 1000, volume = 2_000_000) {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
    close: close * (1 + i * 0.0005),
    volume,
  }));
}

describe('evaluatePointInTimeUniverse', () => {
  it('passes liquid, sufficiently long, moderate-volatility history', () => {
    expect(evaluatePointInTimeUniverse(bars(100)).eligible).toBe(true);
  });
  it('fails closed on insufficient volatility history', () => {
    expect(evaluatePointInTimeUniverse(bars(40)).reasonCodes).toContain('INSUFFICIENT_VOL_HISTORY');
  });
  it('rejects low historical liquidity', () => {
    expect(evaluatePointInTimeUniverse(bars(100, 100, 1_000)).reasonCodes).toContain('AVG_VALUE_BELOW_FLOOR');
  });
  it('does not apply a historical gocap/absolute price floor to split-adjusted provider quote', () => {
    expect(evaluatePointInTimeUniverse(bars(100, 40, 30_000_000)).reasonCodes).not.toContain('AVG_VALUE_BELOW_FLOOR');
    expect(evaluatePointInTimeUniverse(bars(100, 40, 30_000_000)).eligible).toBe(true);
  });
  it('accepts zero-volume days as observed zero turnover rather than corrupt data', () => {
    const xs = bars(100); xs[70]!.volume = 0;
    expect(evaluatePointInTimeUniverse(xs).reasonCodes).not.toContain('INVALID_BAR_DATA');
  });
});
