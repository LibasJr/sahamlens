import { describe, expect, it } from 'vitest';
import {
  calculatePiotroskiFScore,
  calculateAltmanZScore,
  calculateSectorBenchmark,
  calculateDividendSafety,
  calculateValuationPercentile,
  buildFundamentalHealthSuite,
} from '../financial-health';

describe('financial-health calculation engine — zero dummy', () => {
  const currentSnapshot = {
    trailingPE: 10.5,
    priceToBook: 1.4,
    returnOnEquity: 0.18,
    returnOnAssets: 0.08,
    currentRatio: 1.8,
    grossMargins: 0.35,
    operatingCashflow: 5_000_000_000_000,
    freeCashflow: 3_000_000_000_000,
    dividendYield: 0.045,
    payoutRatio: 0.55,
  };

  it('does not fabricate a Piotroski score from an incomplete current snapshot', () => {
    const res = calculatePiotroskiFScore(currentSnapshot, []);
    expect(res.score).toBeNull();
    expect(res.verdict).toBe('DATA_UNAVAILABLE');
    expect(res.availableChecks).toBeLessThan(9);
    expect(res.checks).toHaveLength(9);
    expect(res.checks.some((item) => item.passed === null)).toBe(true);
  });

  it('calculates Piotroski only when all nine required checks are available', () => {
    const res = calculatePiotroskiFScore({
      returnOnAssets: 0.08,
      priorReturnOnAssets: 0.06,
      operatingCashflow: 5_000_000_000_000,
      netIncome: 3_000_000_000_000,
      longTermDebtToAssets: 0.20,
      priorLongTermDebtToAssets: 0.25,
      currentRatio: 1.8,
      priorCurrentRatio: 1.5,
      sharesOutstanding: 100,
      priorSharesOutstanding: 100,
      grossMargins: 0.35,
      priorGrossMargins: 0.30,
      assetTurnover: 1.2,
      priorAssetTurnover: 1.1,
    });

    expect(res.availableChecks).toBe(9);
    expect(res.score).toBe(9);
    expect(res.verdict).toBe('STRONG');
  });

  it('keeps Altman unavailable when required raw components are missing', () => {
    const resBank = calculateAltmanZScore(currentSnapshot, { sector: 'Financials', industry: 'Banks' });
    expect(resBank.zone).toBe('NOT_APPLICABLE');
    expect(resBank.score).toBeNull();

    const incomplete = calculateAltmanZScore(currentSnapshot, { sector: 'Basic Materials' });
    expect(incomplete.zone).toBe('DATA_UNAVAILABLE');
    expect(incomplete.score).toBeNull();
  });

  it('calculates Altman Z from the actual five-factor inputs only', () => {
    const res = calculateAltmanZScore({
      workingCapital: 20,
      totalAssets: 100,
      retainedEarnings: 30,
      ebit: 15,
      marketCap: 120,
      totalLiabilities: 50,
      totalRevenue: 110,
    }, { sector: 'Basic Materials' });

    expect(res.score).toBeCloseTo(3.7, 1);
    expect(res.zone).toBe('SAFE');
  });

  it('requires an explicit real peer median for sector-relative valuation', () => {
    const missing = calculateSectorBenchmark('Energy', {
      trailingPE: 5.0,
      priceToBook: 1.0,
      returnOnEquity: 0.22,
    });
    expect(missing.verdict).toBe('DATA_UNAVAILABLE');
    expect(missing.sectorMedianPE).toBeNull();

    const realMedian = calculateSectorBenchmark('Energy', {
      trailingPE: 5.0,
      priceToBook: 1.0,
      returnOnEquity: 0.22,
    }, {
      pe: 8.0,
      pbv: 1.5,
      roePct: 18,
      source: 'verified-peer-snapshot',
    });
    expect(realMedian.peDiscountPct).toBe(-37);
    expect(realMedian.verdict).toBe('ATTRACTIVE');
    expect(realMedian.source).toBe('verified-peer-snapshot');
  });

  it('does not turn missing dividend data into no-dividend or safe coverage', () => {
    const missing = calculateDividendSafety({ freeCashflow: 3_000_000_000 });
    expect(missing.hasDividend).toBeNull();
    expect(missing.safetyRating).toBe('DATA_UNAVAILABLE');

    const partial = calculateDividendSafety({ dividendYield: 0.045, freeCashflow: 3_000_000_000 });
    expect(partial.safetyRating).toBe('DATA_PARTIAL');

    const complete = calculateDividendSafety(currentSnapshot);
    expect(complete.hasDividend).toBe(true);
    expect(complete.dividendYieldPct).toBe(4.5);
    expect(complete.safetyRating).toBe('SAFE');
    expect(complete.fcfPositive).toBe(true);
  });

  it('requires actual historical valuation observations before publishing a percentile', () => {
    const unavailable = calculateValuationPercentile(currentSnapshot);
    expect(unavailable.pePercentile).toBeNull();
    expect(unavailable.pbvPercentile).toBeNull();

    const percentile = calculateValuationPercentile({
      ...currentSnapshot,
      historicalPE: [7, 8, 9, 10, 11, 12, 13, 14],
      historicalPBV: [0.8, 1.0, 1.1, 1.2, 1.3, 1.4, 1.6, 1.8],
    });
    expect(percentile.peSampleSize).toBe(8);
    expect(percentile.pbvSampleSize).toBe(8);
    expect(percentile.pePercentile).not.toBeNull();
    expect(percentile.pbvPercentile).not.toBeNull();
  });

  it('builds a full suite while preserving unavailable fields as unavailable', () => {
    const suite = buildFundamentalHealthSuite(currentSnapshot, { sector: 'Financials', industry: 'Banks' }, []);
    expect(suite.piotroski.verdict).toBe('DATA_UNAVAILABLE');
    expect(suite.altmanZ.zone).toBe('NOT_APPLICABLE');
    expect(suite.sectorBenchmark.verdict).toBe('DATA_UNAVAILABLE');
    expect(suite.valuationPercentile.pePercentile).toBeNull();
  });
});
