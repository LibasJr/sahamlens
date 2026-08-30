export type HealthState = 'checking' | 'connected' | 'offline';
export type WatchlistItem = { symbol: string; name?: string; price?: number; changePct?: number };

export async function checkHealth(baseUrl = ''): Promise<HealthState> {
  try {
    const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(8000) });
    return response.ok ? 'connected' : 'offline';
  } catch { return 'offline'; }
}

export async function getWatchlist(baseUrl = ''): Promise<WatchlistItem[]> {
  const response = await fetch(`${baseUrl}/api/watchlist`, { credentials: 'include', signal: AbortSignal.timeout(10000) });
  if (response.status === 401 || response.status === 403) return [];
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json() as { items?: WatchlistItem[]; watchlist?: WatchlistItem[] };
  return body.items ?? body.watchlist ?? [];
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://sahamlens.id';
