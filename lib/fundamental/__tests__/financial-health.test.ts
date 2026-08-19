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

  // Temuan M-02 (audit 2026-08-19): Z klasik (manufaktur) diganti Z'' (non-manufaktur &
  // pasar berkembang). Acuan dihitung terpisah dari rumusnya:
  //   6.56(20/100) + 3.26(30/100) + 6.72(15/100) + 1.05((100-50)/50)
  // = 1.312 + 0.978 + 1.008 + 1.050 = 4.348
  it("calculates Altman Z'' from the actual four-factor inputs only", () => {
    const res = calculateAltmanZScore({
      workingCapital: 20,
      totalAssets: 100,
      retainedEarnings: 30,
      ebit: 15,
      totalLiabilities: 50,
    }, { sector: 'Basic Materials' });

    expect(res.score).toBeCloseTo(4.35, 2);
    expect(res.zone).toBe('SAFE');
  });

  it("Z'' tidak butuh marketCap maupun revenue - skor tidak bergerak mengikuti harga saham", () => {
    const inputs = {
      workingCapital: 20,
      totalAssets: 100,
      retainedEarnings: 30,
      ebit: 15,
      totalLiabilities: 50,
    };
    const murah = calculateAltmanZScore({ ...inputs, marketCap: 40 }, { sector: 'Industrials' });
    const mahal = calculateAltmanZScore({ ...inputs, marketCap: 400 }, { sector: 'Industrials' });
    expect(murah.score).toBe(mahal.score);
  });

  // Inti M-02: suku Sales/TA pada Z klasik menghukum model bisnis padat modal yang
  // perputaran asetnya memang rendah secara struktural (jalan tol, menara, properti).
  it('emiten padat modal yang solven tidak lagi jatuh ke DISTRESS karena perputaran aset rendah', () => {
    const jalanTol = calculateAltmanZScore({
      workingCapital: 5,
      totalAssets: 100,
      retainedEarnings: 25,
      ebit: 9,
      totalLiabilities: 45,
      totalRevenue: 12, // perputaran aset 0,12x - wajar untuk aset konsesi jangka panjang
      marketCap: 90,
    }, { sector: 'Industrials' });

    // Z klasik untuk masukan yang sama = 1.2(.05)+1.4(.25)+3.3(.09)+0.6(2.0)+1.0(.12)
    // = 0.06+0.35+0.297+1.2+0.12 = 2.03 -> GREY, nyaris DISTRESS.
    expect(jalanTol.score).toBeGreaterThan(2.6);
    expect(jalanTol.zone).toBe('SAFE');
  });

  it("ambang zona memakai 1,1 dan 2,6 (Z''), bukan 1,8/2,99 milik Z klasik", () => {
    const grey = calculateAltmanZScore({
      workingCapital: 0,
      totalAssets: 100,
      retainedEarnings: 0,
      ebit: 5,
      totalLiabilities: 60,
    }, { sector: 'Energy' });
    // 6.56(0) + 3.26(0) + 6.72(0.05) + 1.05(40/60) = 0.336 + 0.70 = 1.036 -> DISTRESS
    expect(grey.score).toBeCloseTo(1.04, 2);
    expect(grey.zone).toBe('DISTRESS');
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

  // Payout ratio negatif = dividen dibayar saat laba bersih negatif. Ambang lama hanya
  // menguji batas atas (>85 / >65), sehingga angka negatif jatuh ke 'SAFE' - kondisi
  // paling rawan justru dirating paling aman.
  it('payout ratio negatif dirating CAUTION, bukan SAFE', () => {
    const result = calculateDividendSafety({
      dividendYield: 0.074,
      payoutRatio: -0.42,
      freeCashflow: 3_000_000_000,
    });

    expect(result.payoutRatioPct).toBe(-42);
    expect(result.safetyRating).toBe('CAUTION');
    expect(result.narrative).toContain('negatif');
  });

  it('payout ratio rendah yang wajar tetap SAFE', () => {
    const result = calculateDividendSafety({
      dividendYield: 0.074,
      payoutRatio: 0.326,
      freeCashflow: 3_000_000_000,
    });

    expect(result.payoutRatioPct).toBe(32.6);
    expect(result.dividendYieldPct).toBe(7.4);
    expect(result.safetyRating).toBe('SAFE');
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
