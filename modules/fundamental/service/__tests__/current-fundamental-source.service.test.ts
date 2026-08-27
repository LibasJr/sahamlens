import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/fundamental/provider/yahoo-fundamental-quote.provider', () => ({
  fetchYahooFundamentalQuote: vi.fn(),
}));

vi.mock('@/shared/market/usd-idr-rate', () => ({
  getUsdIdrRate: vi.fn(),
}));

import { fetchYahooFundamentalQuote } from '@/modules/fundamental/provider/yahoo-fundamental-quote.provider';
import { getUsdIdrRate } from '@/shared/market/usd-idr-rate';
import { fetchCurrentFundamentalSource } from '../current-fundamental-source.service';

function usdQuote() {
  return {
    assetProfile: null,
    summaryDetail: null,
    price: { regularMarketPrice: 2_000, currency: 'IDR', longName: null, shortName: null },
    defaultKeyStatistics: { bookValue: 2, priceToBook: 1, trailingEps: null },
    financialData: {
      financialCurrency: 'USD',
      freeCashflow: 10,
      operatingCashflow: 20,
      totalRevenue: 30,
      grossProfits: 12,
      totalCash: 5,
      totalDebt: 8,
    },
  };
}

describe('fetchCurrentFundamentalSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes ticker and forwards timeout to the validated provider', async () => {
    vi.mocked(fetchYahooFundamentalQuote).mockResolvedValue(null);

    await fetchCurrentFundamentalSource(' bbca ', { timeoutMs: 2_500 });

    expect(fetchYahooFundamentalQuote).toHaveBeenCalledWith('BBCA.JK', { timeoutMs: 2_500 });
  });

  it('converts only currency-sensitive USD fields with a verified rate', async () => {
    vi.mocked(fetchYahooFundamentalQuote).mockResolvedValue(usdQuote() as never);
    vi.mocked(getUsdIdrRate).mockResolvedValue(16_000);

    const result = await fetchCurrentFundamentalSource('TEST');

    expect(result?.defaultKeyStatistics?.bookValue).toBe(32_000);
    expect(result?.defaultKeyStatistics?.priceToBook).toBeCloseTo(0.0625, 8);
    expect(result?.financialData).toMatchObject({
      freeCashflow: 160_000,
      operatingCashflow: 320_000,
      totalRevenue: 480_000,
      grossProfits: 192_000,
      totalCash: 80_000,
      totalDebt: 128_000,
    });
  });

  it('fails closed for mixed-currency fields when the exchange rate is unavailable', async () => {
    vi.mocked(fetchYahooFundamentalQuote).mockResolvedValue(usdQuote() as never);
    vi.mocked(getUsdIdrRate).mockResolvedValue(null);

    const result = await fetchCurrentFundamentalSource('TEST');

    expect(result?.defaultKeyStatistics?.bookValue).toBeNull();
    expect(result?.defaultKeyStatistics?.priceToBook).toBeNull();
    expect(result?.financialData).toMatchObject({
      freeCashflow: null,
      operatingCashflow: null,
      totalRevenue: null,
      grossProfits: null,
      totalCash: null,
      totalDebt: null,
    });
  });
});
