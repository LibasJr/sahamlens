import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
export type HealthState = 'checking' | 'connected' | 'offline';
export type MarketItem = { symbol: string; price: number; changePct: number };
export type MarketPulse = {
  timestamp: string;
  indices: Array<{ symbol: string; name: string; price: number; changePct: number; sparkline?: number[] }>;
  topGainers: MarketItem[];
  topLosers: MarketItem[];
  sectorHeatmap?: Array<{ sector: string; changePct: number; sampleSize?: number; isProxy?: boolean }>;
  marketRegime?: { regime?: { label?: string }; summary?: string; score?: number; confidence?: number; indicators?: Array<{ id: string; label: string; score?: number; raw?: { advanceShare?: number; advancing?: number; declining?: number } }> };
};
export type MarketSummary = { timestamp: string; marketRegime: { benchmark: string; changePct: number; weeklyChangePct: number; trend: string }; topGainers: MarketItem[]; topLosers: MarketItem[]; _meta?: { freshness?: string; cachedAgeSec?: number; cacheTtlSec?: number } };

export const apiFetch = tauriFetch;
async function getJson<T>(url: string): Promise<T> { const response = await apiFetch(url, { credentials: 'include', signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() as Promise<T>; }
const readCache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();
/** Deduplicates overlapping panel requests and keeps short-lived market responses in memory. */
function getCachedJson<T>(url: string, ttlMs: number): Promise<T> {
  const cached = readCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value as Promise<T>;
  const value = getJson<T>(url).catch((error) => { readCache.delete(url); throw error; });
  readCache.set(url, { expiresAt: Date.now() + ttlMs, value });
  return value;
}
export async function checkHealth(baseUrl = ''): Promise<HealthState> { try { return (await apiFetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(8000) })).ok ? 'connected' : 'offline'; } catch { return 'offline'; } }
export async function getMarketSummary(baseUrl = ''): Promise<MarketSummary> { return getCachedJson<MarketSummary>(`${baseUrl}/api/market-summary`, 30_000); }
export async function getMarketPulse(baseUrl = ''): Promise<MarketPulse> { return getCachedJson<MarketPulse>(`${baseUrl}/api/market-pulse`, 30_000); }
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://sahamlens.id';
export type TickerSearchItem = { symbol: string; name: string };
export async function searchTickers(query: string, baseUrl = API_BASE_URL) {
  const payload = await getCachedJson<{ data?: { items?: TickerSearchItem[] }; items?: TickerSearchItem[] }>(`${baseUrl}/api/tickers/search?q=${encodeURIComponent(query)}`, 15_000);
  return payload.data?.items ?? payload.items ?? [];
}
export async function getResearchUniverse(baseUrl = API_BASE_URL) {
  const [summary, pulse] = await Promise.all([getMarketSummary(baseUrl), getMarketPulse(baseUrl)]);
  return { summary, pulse };
}
export type FundamentalSnapshot = {
  ticker: string;
  stock?: { symbol?: string; name?: string; current_price?: number; change_pct?: number };
  consensus?: string;
  fundamentalQuality?: { label?: string; pct?: number };
  analyzers?: Array<{ label: string; value: string; decision: string; confidence: number }>;
  fundamentals?: { marketCap?: number | null; trailingPE?: number | null; priceToBook?: number | null; returnOnEquity?: number | null; dividendYield?: number | null };
  source?: { provider?: string; retrievedAt?: string };
};
export async function getFundamentalSnapshot(ticker: string, baseUrl = API_BASE_URL) {
  return getCachedJson<FundamentalSnapshot>(`${baseUrl}/api/fundamental/${encodeURIComponent(ticker)}`, 60_000);
}
export async function getWatchlist(baseUrl = API_BASE_URL, token?: string) {
  const response = await apiFetch(`${baseUrl}/api/watchlist`, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : undefined, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json() as { data?: { symbol: string; name?: string; price?: number; changePct?: number }[] } | { symbol: string; name?: string; price?: number; changePct?: number }[];
  return Array.isArray(payload) ? payload : payload.data ?? [];
}
export type DesktopWatchlistItem = { symbol: string; buy_price?: number | null; alert_price?: number | null; lot?: number | null };
export async function getDesktopWatchlist() { const payload = await requestFeature('/api/watchlist/desktop') as { data?: DesktopWatchlistItem[] }; return payload.data ?? []; }
export async function addDesktopWatchlist(symbol: string) { return requestFeature('/api/watchlist/desktop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol }) }); }
export async function removeDesktopWatchlist(symbol: string) { return requestFeature(`/api/watchlist/desktop?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' }); }
export type PublicChart = { ticker: string; history: { time: string; open: number; high: number; low: number; close: number; volume: number }[] };
export async function getPublicChart(ticker: string, timeframe: string, baseUrl = API_BASE_URL) { return getCachedJson<PublicChart>(`${baseUrl}/api/public-chart/${encodeURIComponent(ticker)}?tf=${timeframe}`, 30_000); }
export type ScreenerRow = { ticker: string; name: string; entry: number | null; signal: string | null; decision?: { action?: string } | null };
export async function getScreener(baseUrl = API_BASE_URL) { const payload = await getCachedJson<{ analysis?: { top_10_stocks?: ScreenerRow[] }; top_10_stocks?: ScreenerRow[] }>(`${baseUrl}/api/screener`, 30_000); return payload.analysis?.top_10_stocks ?? payload.top_10_stocks ?? []; }
export async function requestFeature(path: string, init: RequestInit = {}, baseUrl = API_BASE_URL) {
  let token: string | null = null;
  try {
    const { getToken } = await import('./tokenStore');
    token = await getToken();
  } catch {
    // Public endpoints must remain usable when the optional local vault is unavailable.
  }
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await apiFetch(`${baseUrl}${path}`, { ...init, credentials: 'include', headers, signal: init.signal ?? AbortSignal.timeout(60000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error((payload as { error?: string } | null)?.error ?? `HTTP ${response.status}`);
  return payload;
}
export async function getAIInsights(ticker: string, baseUrl = API_BASE_URL) { return requestFeature(`/api/recommendations?symbols=${encodeURIComponent(ticker)}`, {}, baseUrl); }
export async function getAccount(baseUrl = API_BASE_URL) { return requestFeature('/api/auth/me', {}, baseUrl); }
/** Desktop bearer tokens are removed locally; the server call also clears any web session held by the native webview. */
export async function logoutDesktop(baseUrl = API_BASE_URL) {
  const { clearToken } = await import('./tokenStore');
  await clearToken();
  await apiFetch(`${baseUrl}/api/auth/desktop/logout`, { method: 'POST', signal: AbortSignal.timeout(8000) }).catch(() => undefined);
}
export type DesktopUpdate = { version?: string; downloadUrl?: string; notes?: string; available?: boolean };
export async function getDesktopUpdate(currentVersion: string, baseUrl = API_BASE_URL) {
  return getJson<DesktopUpdate>(`${baseUrl}/api/desktop/update?current=${encodeURIComponent(currentVersion)}`);
}
export async function getPortfolio(baseUrl = API_BASE_URL) { return requestFeature('/api/portfolio', {}, baseUrl); }
export async function getAdminOverview(baseUrl = API_BASE_URL) { return requestFeature('/api/admin/desktop-overview', {}, baseUrl); }
export type DesktopAccount = { authenticated: boolean; user?: { email?: string; role?: string; is_pro?: boolean } };
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}
export async function loginDesktop(email: string, password: string, baseUrl = API_BASE_URL) {
  const response = await apiFetch(`${baseUrl}/api/auth/desktop/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(20000) });
  const payload = await response.json().catch(() => null) as { error?: string; token?: string; meta?: { requestId?: string } } | null;
  if (!response.ok || !payload?.token) {
    const requestId = payload?.meta?.requestId;
    throw new Error(`${payload?.error ?? `Login gagal (HTTP ${response.status}).`}${requestId ? ` ID: ${requestId}` : ''}`);
  }
  const { clearToken, saveToken } = await import('./tokenStore');
  try {
    await saveToken(payload.token);
  } catch (error) {
    throw new Error(`Credential diterima server, tetapi token gagal disimpan aman: ${errorMessage(error)}`);
  }
  try {
    const account = await getAccount(baseUrl) as DesktopAccount;
    if (!account.authenticated || !account.user) throw new Error('Sesi desktop tidak dapat diverifikasi.');
    return account;
  } catch (error) {
    await clearToken().catch(() => undefined);
    throw error;
  }
}
