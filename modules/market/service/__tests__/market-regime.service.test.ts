import { describe, expect, it } from 'vitest';
import {
  MARKET_REGIME_WEIGHTS,
  computeQuantitativeMarketRegime,
  type RegimeDailyBar,
} from '../market-regime.service';

function historyFromReturns(returns: number[]): RegimeDailyBar[] {
  let close = 100;
  return [
    { date: '2026-01-01', close },
    ...returns.map((change, index) => {
      close *= 1 + change;
      return {
        date: new Date(Date.UTC(2026, 0, index + 2)).toISOString().slice(0, 10),
        close,
      };
    }),
  ];
}

const positiveIndices = [
  { name: 'IHSG', changePct: 1.1 },
  { name: 'LQ45', changePct: 1.4 },
  { name: 'IDX30', changePct: 1.5 },
  { name: 'Kompas100', changePct: 1.0 },
];

const positiveSectors = Array.from({ length: 11 }, (_, index) => ({
  sector: 'Sektor ' + index,
  changePct: index < 9 ? 1 : -0.2,
}));

describe('quantitative market regime', () => {
  it('memiliki bobot metodologi yang tepat 100%', () => {
    expect(Object.values(MARKET_REGIME_WEIGHTS).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('mengklasifikasikan tren naik luas sebagai bull expansion atau risk-on', () => {
    const result = computeQuantitativeMarketRegime({
      asOf: '2026-08-11T03:00:00.000Z',
      ihsgHistory: historyFromReturns(Array.from({ length: 150 }, () => 0.003)),
      breadth: { advancing: 44, declining: 8, unchanged: 2, total: 54, expectedTotal: 54 },
      indices: positiveIndices,
      sectors: positiveSectors,
    });

    expect(result.score).not.toBeNull();
    expect(result.score as number).toBeGreaterThanOrEqual(70);
    expect(['BULL_EXPANSION', 'RISK_ON']).toContain(result.regime.code);
    expect(['GREED', 'EXTREME_GREED']).toContain(result.fearGreed.code);
    expect(result.confidence).toBeGreaterThanOrEqual(90);
  });

  it('mengklasifikasikan tekanan luas dan volatil sebagai risk-off', () => {
    const calm = Array.from({ length: 120 }, () => -0.001);
    const stress = Array.from({ length: 30 }, (_, index) => index % 2 === 0 ? -0.035 : 0.012);
    const result = computeQuantitativeMarketRegime({
      ihsgHistory: historyFromReturns([...calm, ...stress]),
      breadth: { advancing: 6, declining: 46, unchanged: 2, total: 54, expectedTotal: 54 },
      indices: positiveIndices.map((item) => ({ ...item, changePct: -Math.abs(item.changePct) })),
      sectors: positiveSectors.map((item) => ({ ...item, changePct: -1 })),
    });

    expect(result.score).not.toBeNull();
    expect(result.score as number).toBeLessThan(40);
    expect(['RISK_OFF', 'BEAR_STRESS']).toContain(result.regime.code);
    expect(['FEAR', 'EXTREME_FEAR']).toContain(result.fearGreed.code);
  });

  it('tidak menyamarkan data parsial sebagai regime ber-confidence tinggi', () => {
    const result = computeQuantitativeMarketRegime({
      breadth: { advancing: 12, declining: 10, unchanged: 2, total: 24, expectedTotal: 54 },
      indices: [{ name: 'IHSG', changePct: 0.2 }],
      sectors: [],
    });

    expect(result.coverage).toBeLessThan(50);
    expect(result.confidence).toBeLessThan(50);
    expect(result.regime.code).toBe('DATA_LIMITED');
    expect(result.fearGreed.code).toBe('DATA_LIMITED');
  });

  it('menjaga semua skor dan kontribusi dalam rentang yang valid', () => {
    const result = computeQuantitativeMarketRegime({
      ihsgHistory: historyFromReturns(Array.from({ length: 150 }, (_, index) => index % 3 === 0 ? 0.01 : -0.002)),
      breadth: { advancing: 30, declining: 20, unchanged: 4, total: 54, expectedTotal: 54 },
      indices: positiveIndices,
      sectors: positiveSectors,
    });

    expect(result.score as number).toBeGreaterThanOrEqual(0);
    expect(result.score as number).toBeLessThanOrEqual(100);
    for (const indicator of result.indicators.filter((item) => item.score != null)) {
      expect(indicator.score as number).toBeGreaterThanOrEqual(0);
      expect(indicator.score as number).toBeLessThanOrEqual(100);
      expect(indicator.contribution).toBeGreaterThanOrEqual(0);
    }
  });
});
