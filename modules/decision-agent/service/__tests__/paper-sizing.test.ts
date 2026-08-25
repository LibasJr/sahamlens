import { describe, expect, it } from 'vitest';
import { calculatePaperBuyLots, calculatePaperPortfolioCapacity } from '../paper-sizing';

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

describe('calculatePaperPortfolioCapacity', () => {
  it('mengambil batas paling ketat dari total, sektor, dan likuiditas aktual', () => {
    const result = calculatePaperPortfolioCapacity({
      nav: 100_000_000,
      orderPrice: 1_000,
      currentTotalExposureValue: 20_000_000,
      currentSectorExposureValue: 15_000_000,
      avgValue20d: 200_000_000,
      maxTotalExposurePct: 60,
      maxSectorExposurePct: 20,
      maxAdvParticipationPct: 5,
    });
    expect(result.maxByTotalExposure).toBe(400);
    expect(result.maxBySectorExposure).toBe(50);
    expect(result.maxByLiquidity).toBe(100);
    expect(result.lots).toBe(50);
    expect(result.bindingConstraint).toBe('SECTOR_EXPOSURE');
  });

  it('menolak ketika ADV tidak tersedia', () => {
    expect(calculatePaperPortfolioCapacity({
      nav: 100, orderPrice: 10, currentTotalExposureValue: 0, currentSectorExposureValue: 0,
      avgValue20d: 0, maxTotalExposurePct: 50, maxSectorExposurePct: 20, maxAdvParticipationPct: 5,
    }).lots).toBe(0);
  });
});
