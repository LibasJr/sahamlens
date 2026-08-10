import { describe, expect, it } from 'vitest';
import { normalizePublicEarningsData } from '../public-earnings-data.service';

const RETRIEVED_AT = new Date('2026-08-11T00:00:00.000Z');

describe('normalizePublicEarningsData', () => {
  it('memisahkan fakta hasil, konsensus, cakupan, dan warning berbasis data', () => {
    const result = normalizePublicEarningsData('BBCA.JK', {
      price: {
        longName: 'PT Bank Central Asia Tbk',
        regularMarketPrice: 9000,
        currency: 'IDR',
      },
      assetProfile: { sector: 'Financial Services', industry: 'Banks' },
      calendarEvents: {
        earnings: {
          earningsDate: [new Date('2026-10-20T09:15:00.000Z')],
          isEarningsDateEstimate: true,
        },
      },
      earnings: {
        defaultMethodology: 'nongaap',
        earningsChart: {
          currentFiscalQuarter: '3Q2026',
          quarterly: [{
            date: '2Q2026',
            fiscalQuarter: '2Q2026',
            periodEndDate: new Date('2026-06-30T00:00:00.000Z'),
            reportedDate: new Date('2026-07-28T00:00:00.000Z'),
            actual: 121,
            estimate: 122,
            difference: '-1',
            surprisePct: '-0.82',
          }],
        },
        financialsChart: {
          quarterly: [{
            date: '2Q2026',
            fiscalQuarter: '2Q2026',
            revenue: 28_000_000,
            earnings: 14_000_000,
            profitMargin: 0.5,
          }],
          yearly: [{
            date: 2025,
            revenue: 110_000_000,
            earnings: 55_000_000,
            profitMargin: 0.5,
          }],
        },
        financialCurrency: 'IDR',
      },
      earningsTrend: {
        trend: [{
          period: '0q',
          endDate: new Date('2026-09-30T00:00:00.000Z'),
          earningsEstimate: {
            avg: 125,
            low: 124,
            high: 126,
            yearAgoEps: 117,
            growth: 0.068,
            numberOfAnalysts: 2,
            earningsCurrency: 'IDR',
          },
          revenueEstimate: {
            avg: 29_000_000,
            low: 28_500_000,
            high: 29_500_000,
            yearAgoRevenue: 27_000_000,
            growth: 0.074,
            numberOfAnalysts: 1,
            revenueCurrency: 'IDR',
          },
          epsTrend: { current: 125, '7daysAgo': 123, '30daysAgo': 122 },
          epsRevisions: {
            upLast7days: 1,
            downLast7Days: 0,
            upLast30days: 2,
            downLast30days: 0,
          },
        }],
      },
      financialData: {
        revenueGrowth: 0.08,
        earningsGrowth: 0.1,
        freeCashflow: -5_000_000,
        operatingCashflow: 8_000_000,
        profitMargins: 0.5,
        operatingMargins: 0.55,
        financialCurrency: 'IDR',
      },
    }, RETRIEVED_AT);

    expect(result.stock.name).toBe('PT Bank Central Asia Tbk');
    expect(result.quarters[0]).toMatchObject({
      quarter: '2Q2026',
      actualEps: 121,
      estimatedEps: 122,
      surprisePct: -0.82,
      revenue: 28_000_000,
      status: 'MISS',
    });
    expect(result.expectation.eps.analystCount).toBe(2);
    expect(result.expectation.revenue.analystCount).toBe(1);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'ESTIMATED_DATE',
      'LOW_EPS_COVERAGE',
      'LOW_REVENUE_COVERAGE',
      'NEGATIVE_FREE_CASHFLOW',
      'LATEST_EPS_MISS',
    ]);
    expect(result.source.retrievedAt).toBe(RETRIEVED_AT.toISOString());
    expect(result.coverage.percent).toBe(100);
  });

  it('mengembalikan null dan array kosong saat provider tidak memiliki data', () => {
    const result = normalizePublicEarningsData('TST.JK', {}, RETRIEVED_AT);

    expect(result.stock.name).toBe('TST.JK');
    expect(result.upcoming.date).toBeNull();
    expect(result.expectation.eps.average).toBeNull();
    expect(result.quarters).toEqual([]);
    expect(result.annuals).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.coverage.available).toBe(0);
  });

  it('mengubah surprisePercent berbentuk rasio menjadi persen pada fallback history', () => {
    const result = normalizePublicEarningsData('BBRI.JK', {
      earningsHistory: {
        history: [{
          quarter: new Date('2026-03-31T00:00:00.000Z'),
          epsActual: 100,
          epsEstimate: 98,
          epsDifference: 2,
          surprisePercent: 0.0204,
        }],
      },
    }, RETRIEVED_AT);

    expect(result.quarters[0].surprisePct).toBeCloseTo(2.04);
    expect(result.quarters[0].status).toBe('BEAT');
  });
});
