import { resolvePreviousClose } from '@/shared/market/previous-close';

export interface MarketQuote {
  symbol: string;
  price: number;
  changePct: number | null;
  volume: number | null;
  source: string;
  timestamp: number | null;
}

export interface MarketDataProvider {
  name: string;
  isConfigured(): boolean;
  fetchQuote(symbol: string): Promise<MarketQuote | null>;
}

export interface YahooChartFetchOptions {
  range: string;
  interval: string;
  timeoutMs?: number;
}

export interface YahooChartFetchResult {
  payload: unknown;
  sourceId: 'YAHOO_CHART';
  url: string;
  latencyMs: number;
}

export async function fetchYahooChartJson(
  symbol: string,
  options: YahooChartFetchOptions,
): Promise<YahooChartFetchResult> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(options.range)}&interval=${encodeURIComponent(options.interval)}`;
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`YAHOO_CHART_HTTP_${res.status}`);
    return {
      payload: await res.json() as unknown,
      sourceId: 'YAHOO_CHART',
      url,
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export class YahooFinanceProvider implements MarketDataProvider {
  name = 'YAHOO_FINANCE';

  isConfigured(): boolean {
    return true; // default public provider
  }

  async fetchQuote(symbol: string): Promise<MarketQuote | null> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) return null;

      const json = await res.json();
      const result = json.chart?.result?.[0];
      if (!result) return null;

      const meta = result.meta;
      const price = meta.regularMarketPrice;
      const resolved = resolvePreviousClose({
        timestamps: result.timestamp,
        closes: result.indicators?.quote?.[0]?.close,
        metaPreviousClose: meta.previousClose,
        metaChartPreviousClose: meta.chartPreviousClose,
      });
      const prevClose = resolved.previousClose;

      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
      const changePct = typeof prevClose === 'number' && prevClose > 0
        ? parseFloat((((price - prevClose) / prevClose) * 100).toFixed(2))
        : null;

      return {
        symbol,
        price,
        changePct,
        volume: typeof meta.regularMarketVolume === 'number' ? meta.regularMarketVolume : null,
        source: 'Yahoo Finance',
        // Missing provider timestamp harus tetap missing; memakai Date.now() akan
        // membuat data tanpa timestamp terlihat baru/fresh padahal provenance waktunya tidak diketahui.
        timestamp: typeof meta.regularMarketTime === 'number' ? meta.regularMarketTime * 1000 : null,
      };
    } catch {
      return null;
    }
  }
}

export class SecondaryRestProvider implements MarketDataProvider {
  name = 'SECONDARY_REST_FEED';

  isConfigured(): boolean {
    return !!process.env.SECONDARY_MARKET_API_URL && !!process.env.SECONDARY_MARKET_API_KEY;
  }

  async fetchQuote(symbol: string): Promise<MarketQuote | null> {
    if (!this.isConfigured()) return null;
    try {
      const endpoint = `${process.env.SECONDARY_MARKET_API_URL}/quote?symbol=${encodeURIComponent(symbol)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${process.env.SECONDARY_MARKET_API_KEY}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) return null;

      const data = await res.json();
      if (!data || typeof data.price !== 'number' || !Number.isFinite(data.price)) return null;

      return {
        symbol,
        price: data.price,
        changePct: typeof data.changePct === 'number' && Number.isFinite(data.changePct) ? data.changePct : null,
        volume: typeof data.volume === 'number' ? data.volume : null,
        source: 'Secondary Datafeed',
        timestamp: typeof data.timestamp === 'number' && Number.isFinite(data.timestamp) ? data.timestamp : null,
      };
    } catch {
      return null;
    }
  }
}

export class ResilientMarketDataFeed {
  private primary: MarketDataProvider;
  private secondary: MarketDataProvider;
  private primaryFailCount = 0;
  private lastPrimaryFailureTime = 0;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 3;
  private readonly CIRCUIT_BREAKER_COOLDOWN_MS = 60000; // 1 minute

  constructor(primary?: MarketDataProvider, secondary?: MarketDataProvider) {
    this.primary = primary || new YahooFinanceProvider();
    this.secondary = secondary || new SecondaryRestProvider();
  }

  private isPrimaryCircuitOpen(): boolean {
    if (this.primaryFailCount >= this.CIRCUIT_BREAKER_THRESHOLD) {
      if (Date.now() - this.lastPrimaryFailureTime < this.CIRCUIT_BREAKER_COOLDOWN_MS) {
        return true; // circuit open, skip primary
      }
      // Half-open: allow probe
      this.primaryFailCount = 0;
    }
    return false;
  }

  async fetchQuoteWithFallback(symbol: string): Promise<MarketQuote | null> {
    // 1. Try Primary if circuit breaker is not open
    if (!this.isPrimaryCircuitOpen() && this.primary.isConfigured()) {
      const quote = await this.primary.fetchQuote(symbol);
      if (quote) {
        this.primaryFailCount = 0; // reset on success
        return quote;
      }
      this.primaryFailCount++;
      this.lastPrimaryFailureTime = Date.now();
    }

    // 2. Fallback to Secondary if configured
    if (this.secondary.isConfigured()) {
      const secondaryQuote = await this.secondary.fetchQuote(symbol);
      if (secondaryQuote) return secondaryQuote;
    }

    return null;
  }

  getCircuitBreakerStatus(): { primaryFails: number; isOpen: boolean; secondaryActive: boolean } {
    return {
      primaryFails: this.primaryFailCount,
      isOpen: this.isPrimaryCircuitOpen(),
      secondaryActive: this.secondary.isConfigured(),
    };
  }
}

export const marketDataFeed = new ResilientMarketDataFeed();
