import { describe, expect, it } from 'vitest';
import {
  calculatePiotroskiFScore,
  calculateAltmanZScore,
  calculateSectorBenchmark,
  calculateDividendSafety,
  calculateValuationPercentile,
  buildFundamentalHealthSuite,
} from '../financial-health';

describe('financial-health calculation engine', () => {
  const mockFundamentals = {
    trailingPE: 10.5,
    priceToBook: 1.4,
    returnOnEquity: 0.18,
    returnOnAssets: 0.08,
    debtToEquity: 0.6,
    currentRatio: 1.8,
    grossMargins: 0.35,
    profitMargins: 0.15,
    revenueGrowth: 0.12,
    operatingCashflow: 5_000_000_000_000,
    freeCashflow: 3_000_000_000_000,
    dividendYield: 0.045,
    payoutRatio: 0.55,
  };

  const mockProfile = {
    sector: 'Financials',
    industry: 'Banks',
  };

  it('calculates Piotroski F-Score accurately', () => {
    const res = calculatePiotroskiFScore(mockFundamentals, []);
    expect(res.score).toBeGreaterThanOrEqual(7);
    expect(res.verdict).toBe('STRONG');
    expect(res.checks.length).toBe(9);
  });

  it('handles bank sector appropriately for Altman Z-Score', () => {
    const resBank = calculateAltmanZScore(mockFundamentals, mockProfile);
    expect(resBank.isFinancialSector).toBe(true);
    expect(resBank.zone).toBe('NOT_APPLICABLE');

    const resNonBank = calculateAltmanZScore(mockFundamentals, { sector: 'Basic Materials' });
    expect(resNonBank.isFinancialSector).toBe(false);
    expect(resNonBank.zone).toBe('SAFE');
    expect(resNonBank.score).toBeGreaterThan(2.6);
  });

  it('calculates sector relative valuation discount and premium', () => {
    const res = calculateSectorBenchmark('Energy', {
      trailingPE: 5.0,
      priceToBook: 1.0,
      returnOnEquity: 0.22,
    });
    expect(res.peDiscountPct).toBeLessThan(0); // Cheaper than sector median 6.8x
    expect(res.verdict).toBe('ATTRACTIVE');
  });

  it('calculates dividend safety and cash flow coverage', () => {
    const res = calculateDividendSafety(mockFundamentals);
    expect(res.hasDividend).toBe(true);
    expect(res.dividendYieldPct).toBe(4.5);
    expect(res.safetyRating).toBe('SAFE');
    expect(res.fcfCovered).toBe(true);
  });

  it('calculates valuation percentiles and builds full suite', () => {
    const percentile = calculateValuationPercentile(mockFundamentals);
    expect(percentile.pePercentile).toBeGreaterThan(0);
    expect(percentile.pbvPercentile).toBeGreaterThan(0);

    const fullSuite = buildFundamentalHealthSuite(mockFundamentals, mockProfile, []);
    expect(fullSuite.piotroski).toBeDefined();
    expect(fullSuite.sectorBenchmark).toBeDefined();
    expect(fullSuite.dividendSafety).toBeDefined();
  });
});
