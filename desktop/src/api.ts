export type HealthState = 'checking' | 'connected' | 'offline';
export type MarketItem = { symbol: string; price: number; changePct: number };
export type MarketSummary = {
  timestamp: string;
  marketRegime: { benchmark: string; changePct: number; weeklyChangePct: number; trend: string };
  topGainers: MarketItem[];
  topLosers: MarketItem[];
  _meta?: { freshness?: string; cachedAgeSec?: number; cacheTtlSec?: number };
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export async function checkHealth(baseUrl = ''): Promise<HealthState> {
  try { return (await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(8000) })).ok ? 'connected' : 'offline'; }
  catch { return 'offline'; }
}

export async function getMarketSummary(baseUrl = ''): Promise<MarketSummary> {
  return getJson<MarketSummary>(`${baseUrl}/api/market-summary`);
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://sahamlens.id';
