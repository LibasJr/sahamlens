import { describe, expect, it, vi } from 'vitest';
import {
  ResilientMarketDataFeed,
  type MarketDataProvider,
  type MarketQuote,
} from '../data-provider-adapter';

describe('ResilientMarketDataFeed with Circuit Breaker', () => {
  it('menggunakan data dari primary provider saat normal', async () => {
    const mockPrimary: MarketDataProvider = {
      name: 'MOCK_PRIMARY',
      isConfigured: () => true,
      fetchQuote: vi.fn(async (sym) => ({
        symbol: sym,
        price: 10000,
        changePct: 2.5,
        volume: 5000000,
        source: 'Primary Source',
        timestamp: Date.now(),
      })),
    };

    const mockSecondary: MarketDataProvider = {
      name: 'MOCK_SECONDARY',
      isConfigured: () => true,
      fetchQuote: vi.fn(),
    };

    const feed = new ResilientMarketDataFeed(mockPrimary, mockSecondary);
    const quote = await feed.fetchQuoteWithFallback('BBCA.JK');

    expect(quote).not.toBeNull();
    expect(quote?.price).toBe(10000);
    expect(mockPrimary.fetchQuote).toHaveBeenCalledTimes(1);
    expect(mockSecondary.fetchQuote).not.toHaveBeenCalled();
  });

  it('fallback ke secondary provider saat primary gagal', async () => {
    const mockPrimary: MarketDataProvider = {
      name: 'MOCK_PRIMARY',
      isConfigured: () => true,
      fetchQuote: vi.fn(async () => null), // primary fails
    };

    const mockSecondary: MarketDataProvider = {
      name: 'MOCK_SECONDARY',
      isConfigured: () => true,
      fetchQuote: vi.fn(async (sym) => ({
        symbol: sym,
        price: 9950,
        changePct: 2.0,
        volume: 4900000,
        source: 'Secondary Source',
        timestamp: Date.now(),
      })),
    };

    const feed = new ResilientMarketDataFeed(mockPrimary, mockSecondary);
    const quote = await feed.fetchQuoteWithFallback('BBRI.JK');

    expect(quote).not.toBeNull();
    expect(quote?.price).toBe(9950);
    expect(quote?.source).toBe('Secondary Source');
    expect(mockSecondary.fetchQuote).toHaveBeenCalledTimes(1);
  });
});
