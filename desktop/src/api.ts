import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
export type HealthState = 'checking' | 'connected' | 'offline';
export type MarketItem = { symbol: string; price: number; changePct: number };
export type MarketPulse = { timestamp: string; indices: Array<{ symbol: string; name: string; price: number; changePct: number; sparkline?: number[] }>; topGainers: MarketItem[]; topLosers: MarketItem[] };
export type MarketSummary = { timestamp: string; marketRegime: { benchmark: string; changePct: number; weeklyChangePct: number; trend: string }; topGainers: MarketItem[]; topLosers: MarketItem[]; _meta?: { freshness?: string; cachedAgeSec?: number; cacheTtlSec?: number } };

export const apiFetch = tauriFetch;
async function getJson<T>(url: string): Promise<T> { const response = await apiFetch(url, { signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() as Promise<T>; }
export async function checkHealth(baseUrl = ''): Promise<HealthState> { try { return (await apiFetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(8000) })).ok ? 'connected' : 'offline'; } catch { return 'offline'; } }
export async function getMarketSummary(baseUrl = ''): Promise<MarketSummary> { return getJson<MarketSummary>(`${baseUrl}/api/market-summary`); }
export async function getMarketPulse(baseUrl = ''): Promise<MarketPulse> { return getJson<MarketPulse>(`${baseUrl}/api/market-pulse`); }
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://sahamlens.id';
export async function getWatchlist(baseUrl = API_BASE_URL, token?: string) {
  const response = await apiFetch(`${baseUrl}/api/watchlist`, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : undefined, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json() as { data?: { symbol: string; name?: string; price?: number; changePct?: number }[] } | { symbol: string; name?: string; price?: number; changePct?: number }[];
  return Array.isArray(payload) ? payload : payload.data ?? [];
}
export type PublicChart = { ticker: string; history: { time: string; open: number; high: number; low: number; close: number; volume: number }[] };
export async function getPublicChart(ticker: string, timeframe: string, baseUrl = API_BASE_URL) { return getJson<PublicChart>(`${baseUrl}/api/public-chart/${encodeURIComponent(ticker)}?tf=${timeframe}`); }
export type ScreenerRow = { ticker: string; name: string; entry: number | null; signal: string | null; decision?: { action?: string } | null };
export async function getScreener(baseUrl = API_BASE_URL) { const payload = await getJson<{ analysis?: { top_10_stocks?: ScreenerRow[] }; top_10_stocks?: ScreenerRow[] }>(`${baseUrl}/api/screener`); return payload.analysis?.top_10_stocks ?? payload.top_10_stocks ?? []; }
export async function requestFeature(path: string, init: RequestInit = {}, baseUrl = API_BASE_URL) {
  const { getToken } = await import('./tokenStore');
  const token = await getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await apiFetch(`${baseUrl}${path}`, { ...init, credentials: 'include', headers, signal: init.signal ?? AbortSignal.timeout(60000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error((payload as { error?: string } | null)?.error ?? `HTTP ${response.status}`);
  return payload;
}
export async function getAIInsights(ticker: string, baseUrl = API_BASE_URL) { return requestFeature(`/api/recommendations?symbols=${encodeURIComponent(ticker)}`, {}, baseUrl); }
export async function getAccount(baseUrl = API_BASE_URL) { return requestFeature('/api/auth/me', {}, baseUrl); }
export async function getPortfolio(baseUrl = API_BASE_URL) { return requestFeature('/api/portfolio', {}, baseUrl); }
