import { describe, expect, it } from 'vitest';
import { parseYahooFundamentalQuote } from '../yahoo-fundamental-quote.provider';

describe('parseYahooFundamentalQuote', () => {
  it('keeps the validated subset needed by valuation services', () => {
    const quote = parseYahooFundamentalQuote({
      assetProfile: {
        sector: 'Industrials',
        industry: 'Engineering',
        longBusinessSummary: 'Validated company description',
        website: 'https://example.com',
      },
      defaultKeyStatistics: {
        trailingEps: 105.5,
        bookValue: 800,
        sharesOutstanding: 1_000_000,
        beta: 1.1,
        priceToBook: 2.3,
        earningsQuarterlyGrowth: 0.12,
      },
      financialData: {
        returnOnEquity: 0.15,
        freeCashflow: 500_000,
        totalDebt: 300_000,
        totalCash: 50_000,
        operatingCashflow: 750_000,
        revenueGrowth: 0.08,
        currentRatio: 1.5,
        financialCurrency: 'IDR',
      },
      summaryDetail: { dividendRate: 20, payoutRatio: 0.4, trailingPE: 14, marketCap: 1_500_000_000 },
      price: { regularMarketPrice: 1500, regularMarketVolume: 25_000, currency: 'IDR', longName: 'Example Tbk' },
      providerOnlyField: 'ignored by domain services',
    });

    expect(quote).toMatchObject({
      assetProfile: { sector: 'Industrials', longBusinessSummary: 'Validated company description' },
      defaultKeyStatistics: { trailingEps: 105.5, sharesOutstanding: 1_000_000 },
      financialData: { freeCashflow: 500_000, operatingCashflow: 750_000, financialCurrency: 'IDR' },
      summaryDetail: { payoutRatio: 0.4, trailingPE: 14 },
      price: { regularMarketPrice: 1500, regularMarketVolume: 25_000, currency: 'IDR' },
    });
  });

  it('fails closed per malformed field while preserving other validated fields', () => {
    const quote = parseYahooFundamentalQuote({
      defaultKeyStatistics: { sharesOutstanding: 'not-a-number', beta: 1.2 },
      financialData: { freeCashflow: 200_000, totalDebt: Number.POSITIVE_INFINITY, financialCurrency: 123 },
      price: { regularMarketPrice: '1500', currency: 'IDR' },
    });

    expect(quote).toMatchObject({
      defaultKeyStatistics: { sharesOutstanding: null, beta: 1.2 },
      financialData: { freeCashflow: 200_000, totalDebt: null, financialCurrency: null },
      price: { regularMarketPrice: null, currency: 'IDR' },
    });
  });

  it('rejects a response that is not an object', () => {
    expect(parseYahooFundamentalQuote(null)).toBeNull();
    expect(parseYahooFundamentalQuote([])).toBeNull();
    expect(parseYahooFundamentalQuote('unavailable')).toBeNull();
  });
});
