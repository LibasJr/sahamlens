export const API_BASE = 'https://sahamlens.id';

export interface MarketPulse {
  ihsg?: {
    price: number;
    change: number;
    pointChange: number;
  };
  regime?: string;
  breadth?: {
    advances: number;
    declines: number;
    unchanged: number;
  };
  topGainers?: Array<{ symbol: string; changePct: number; price: number }>;
  topLosers?: Array<{ symbol: string; changePct: number; price: number }>;
  topVolume?: Array<{ symbol: string; volume: number; price: number }>;
}

export interface StockQuote {
  ticker: string;
  name?: string;
  price: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  per?: number;
  pbv?: number;
  roe?: number;
  lensScore?: number;
  foreignFlow?: 'NET_BUY' | 'NET_SELL' | 'NEUTRAL';
  signal?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface BreakoutCandidate {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  volumeMultiplier: number;
  score: number;
  pattern: string;
  stage: 'EARLY' | 'CONFIRMED' | 'OVERBOUGHT';
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  sentiment?: 'POSITIF' | 'NEGATIF' | 'NETRAL';
  url?: string;
}

export async function fetchMarketPulse(): Promise<MarketPulse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/market-pulse`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch market pulse', err);
    return null;
  }
}

export async function fetchStockDetail(ticker: string): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/api/stock/${encodeURIComponent(ticker)}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch stock detail', err);
    return null;
  }
}

export async function fetchTechnicalChart(ticker: string, timeframe = '1Y'): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/api/public-chart/${encodeURIComponent(ticker)}.JK?tf=${timeframe}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data?.data?.history || data?.history || [];
  } catch (err) {
    console.error('Failed to fetch chart', err);
    return [];
  }
}

export async function fetchBreakoutRadar(): Promise<BreakoutCandidate[]> {
  try {
    const res = await fetch(`${API_BASE}/api/breakout-radar`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    return json?.candidates || json?.items || [];
  } catch (err) {
    console.error('Failed to fetch radar', err);
    return [];
  }
}

export async function fetchNews(): Promise<NewsItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/news`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    return json?.items || [];
  } catch (err) {
    console.error('Failed to fetch news', err);
    return [];
  }
}

export async function searchEmiten(query: string): Promise<Array<{ symbol: string; name: string }>> {
  try {
    const res = await fetch(`${API_BASE}/api/tickers/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    return json?.tickers || json || [];
  } catch {
    return [];
  }
}
