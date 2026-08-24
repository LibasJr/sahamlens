import { describe, expect, it } from 'vitest';
import { calculatePaperBuyLots } from '../paper-sizing';

describe('calculatePaperBuyLots', () => {
  it('mengambil batas paling ketat dari risiko, posisi, dan kas', () => {
    const result = calculatePaperBuyLots({
      nav: 200_000_000,
      cash: 50_000_000,
      price: 10_000,
      stop: 9_500,
      existingLots: 0,
      riskBudgetPct: 1,
      maxPositionPct: 10,
    });
    expect(result.maxByRisk).toBe(40);
    expect(result.maxByPosition).toBe(20);
    expect(result.maxByCash).toBe(50);
    expect(result.lots).toBe(20);
    expect(result.bindingConstraint).toBe('POSITION_LIMIT');
  });

  it('fail-closed saat stop tidak valid', () => {
    expect(calculatePaperBuyLots({
      nav: 1, cash: 1, price: 10_000, stop: 10_000, existingLots: 0,
      riskBudgetPct: 1, maxPositionPct: 10,
    }).lots).toBe(0);
  });
});
