import { invoke } from '@tauri-apps/api/core';

export const API_BASE = 'https://sahamlens.id';

const TOKEN_STORAGE_KEY = 'sahamlens.pro.token';
const USER_STORAGE_KEY = 'sahamlens.pro.user';

export interface UserSession {
  email: string;
  role: 'admin' | 'user' | 'guest';
  token: string | null;
  isPro?: boolean;
}

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

export function getSavedSession(): UserSession {
  try {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const userJson = localStorage.getItem(USER_STORAGE_KEY);
    if (token && userJson) {
      const parsed = JSON.parse(userJson);
      return {
        email: parsed.email || '',
        role: parsed.role || 'user',
        token,
        isPro: Boolean(parsed.is_pro || parsed.isPro),
      };
    }
  } catch {
    // fallback
  }
  return { email: '', role: 'guest', token: null };
}

export function saveSession(session: { email: string; role: string; token: string; isPro?: boolean }) {
  localStorage.setItem(TOKEN_STORAGE_KEY, session.token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ email: session.email, role: session.role, is_pro: session.isPro }));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

/**
 * Native HTTP Request Bridge via Rust (reqwest)
 * Ini melewati blokir CORS / Webview WebView2 browser secara total.
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'DELETE' | 'PUT';
    body?: any;
    headers?: Record<string, string>;
  } = {}
): Promise<{ ok: boolean; status: number; data: T; error?: string }> {
  const session = getSavedSession();
  const method = options.method || 'GET';
  const bodyStr = options.body ? JSON.stringify(options.body) : undefined;
  const token = session.token || undefined;

  // Coba jalankan via Native Tauri Core (Rust)
  try {
    const res = await invoke<{ status: number; body: string; ok: boolean }>('native_api_request', {
      endpoint,
      method,
      body: bodyStr,
      token,
      headers: options.headers || {},
    });

    let parsed: any = null;
    try {
      parsed = JSON.parse(res.body);
    } catch {
      parsed = res.body;
    }

    if (!res.ok) {
      const errMsg = parsed?.error || parsed?.message || `HTTP ${res.status}`;
      return { ok: false, status: res.status, data: parsed, error: errMsg };
    }

    return { ok: true, status: res.status, data: parsed };
  } catch (tauriErr) {
    // Fallback bila dijalankan di browser biasa (bukan desktop window)
    try {
      const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(options.headers || {}),
      };

      const resp = await fetch(url, {
        method,
        headers,
        body: bodyStr,
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        return { ok: false, status: resp.status, data: json, error: json?.error || `HTTP ${resp.status}` };
      }
      return { ok: true, status: resp.status, data: json };
    } catch (fetchErr: any) {
      return { ok: false, status: 0, data: null as any, error: fetchErr.message || 'Koneksi API gagal' };
    }
  }
}

// 1. LOGIN RESMI DESKTOP
export async function loginDesktop(email: string, password: string): Promise<{ ok: boolean; role?: string; email?: string; error?: string }> {
  const res = await apiRequest<{ success: boolean; token: string; role: string; email: string }>('/api/auth/desktop/login', {
    method: 'POST',
    body: { email, password },
  });

  if (!res.ok || !res.data?.success) {
    return { ok: false, error: res.error || 'Email atau password salah.' };
  }

  saveSession({
    email: res.data.email || email,
    role: res.data.role || 'user',
    token: res.data.token,
  });

  return { ok: true, role: res.data.role, email: res.data.email };
}

// 2. LIVE MARKET PULSE & SUMMARY
export async function fetchMarketData(): Promise<MarketPulse | null> {
  const [pulseRes, summaryRes] = await Promise.all([
    apiRequest('/api/market-pulse'),
    apiRequest('/api/market-summary'),
  ]);

  const pData = pulseRes.data;
  const sData = summaryRes.data;
  const reg = sData?.marketRegime || pData?.marketRegime;

  return {
    ihsg: reg
      ? {
          price: reg.price || 6640.6,
          change: reg.changePct || -0.4,
          pointChange: reg.pointChange || -27.1,
        }
      : undefined,
    regime: pData?.marketRegime?.regime?.label || sData?.marketRegime?.trend || 'Divergence',
    breadth: pData?.breadth,
    topGainers: sData?.topGainers || [],
    topLosers: sData?.topLosers || [],
    topVolume: sData?.topVolume || [],
  };
}

export async function fetchMarketPulse(): Promise<MarketPulse | null> {
  return fetchMarketData();
}

// 3. CANDLESTICK CHART HISTORY
export async function fetchTechnicalChart(ticker: string, timeframe = '1Y'): Promise<any[]> {
  const clean = ticker.replace('.JK', '');
  const res = await apiRequest(`/api/public-chart/${encodeURIComponent(clean)}.JK?tf=${timeframe}`);
  if (!res.ok) return [];
  return res.data?.data?.history || res.data?.history || [];
}

// 4. EMITEN DETAIL & OVERVIEW
export async function fetchStockOverview(ticker: string): Promise<any> {
  const clean = ticker.replace('.JK', '');
  const res = await apiRequest(`/api/stock/${encodeURIComponent(clean)}`);
  if (!res.ok) {
    if (res.status === 401 || res.error?.includes('Sesi tidak valid')) {
      return { requiresAuth: true, error: 'Silakan masuk dengan akun Anda untuk melihat ringkasan penuh emiten ini.' };
    }
    return { error: res.error };
  }
  return res.data?.data || res.data;
}

// 5. FUNDAMENTAL DATA (BEI XBRL PIT)
export async function fetchFundamental(ticker: string): Promise<any> {
  const clean = ticker.replace('.JK', '');
  const res = await apiRequest(`/api/fundamental/${encodeURIComponent(clean)}`);
  if (!res.ok) return { error: res.error };
  return res.data?.data || res.data;
}

// 6. DCF VALUATION & MARGIN OF SAFETY
export async function fetchValuationDCF(ticker: string): Promise<any> {
  const clean = ticker.replace('.JK', '');
  const res = await apiRequest(`/api/dcf/${encodeURIComponent(clean)}`);
  if (!res.ok) return { error: res.error };
  return res.data;
}

// 7. OWNERSHIP FLOW (KSEI SCRIPLESS & FOREIGN)
export async function fetchOwnershipFlow(ticker: string): Promise<any> {
  const clean = ticker.replace('.JK', '');
  const res = await apiRequest(`/api/ownership-flow/${encodeURIComponent(clean)}`);
  if (!res.ok) return { error: res.error };
  return res.data;
}

// 8. BREAKOUT RADAR
export async function fetchBreakoutRadar(): Promise<any[]> {
  const res = await apiRequest('/api/breakout-radar');
  if (!res.ok) return [];
  return res.data?.data || res.data?.candidates || res.data?.items || [];
}

// 9. SCREENER PRO
export async function fetchScreener(profile = 'Moderat'): Promise<any> {
  const res = await apiRequest(`/api/screener?profile=${encodeURIComponent(profile)}`);
  if (!res.ok) return { error: res.error };
  return res.data?.data?.analysis || res.data?.analysis || res.data?.data || res.data;
}

// 10. NEWS & SENTIMENT
export async function fetchNews(): Promise<any[]> {
  const res = await apiRequest('/api/news');
  if (!res.ok) return [];
  return res.data?.items || [];
}

// 11. CORPORATE CALENDAR
export async function fetchCalendar(): Promise<any> {
  const res = await apiRequest('/api/calendar');
  if (!res.ok) return {};
  return res.data?.events || {};
}

// 12. MACRO ECONOMIC CONTEXT
export async function fetchMacro(): Promise<any[]> {
  const res = await apiRequest('/api/macro');
  if (!res.ok) return [];
  return res.data?.market || [];
}

// 13. QUANT BACKTEST (SERVER SIMULATION)
export async function fetchServerBacktest(symbol: string, periodMonths: number, filter: string): Promise<any> {
  const clean = symbol.replace('.JK', '');
  const res = await apiRequest('/api/backtest', {
    method: 'POST',
    body: {
      symbol: clean,
      filters: [filter],
      modal: 100_000_000,
      period: periodMonths,
    },
  });
  return res.data || { error: res.error };
}

// 14. WATCHLIST (AUTHENTICATED)
export async function fetchWatchlist(): Promise<any[]> {
  const res = await apiRequest('/api/watchlist/desktop');
  if (!res.ok) return [];
  return res.data?.watchlist || res.data?.items || (Array.isArray(res.data) ? res.data : []);
}

export async function addToWatchlist(symbol: string): Promise<boolean> {
  const clean = symbol.replace('.JK', '');
  const res = await apiRequest('/api/watchlist/desktop', {
    method: 'POST',
    body: { symbol: clean },
  });
  return res.ok;
}

// 15. ADMIN OVERVIEW (ROLE: ADMIN)
export async function fetchAdminOverview(): Promise<any> {
  const session = getSavedSession();
  if (session.role !== 'admin' || !session.token) {
    return { forbidden: true, error: 'Akses khusus Administrator.' };
  }
  const res = await apiRequest('/api/admin/desktop-overview');
  if (!res.ok) return { error: res.error };
  return res.data?.data || res.data;
}

// 16. TICKER SEARCH AUTOCOMPLETE
export async function searchEmiten(query: string): Promise<Array<{ symbol: string; name: string }>> {
  const res = await apiRequest(`/api/tickers/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  return res.data?.tickers || res.data || [];
}

// 17. LENSAI RESEARCH CHAT
export async function askLensAI(prompt: string, symbol: string, history: Array<{ role: string; content: string }> = []): Promise<string> {
  const clean = symbol.replace('.JK', '');
  const res = await apiRequest('/api/chat', {
    method: 'POST',
    body: {
      prompt,
      symbol: clean,
      context: `Pengguna sedang membuka emiten ${clean} di aplikasi SahamLens Pro Native Terminal.`,
      history,
    },
  });

  if (!res.ok) {
    return res.error || 'Maaf, LensAI sedang sibuk atau limit tercapai. Silakan coba sesaat lagi.';
  }

  return res.data?.content || res.data?.reply || res.data?.answer || 'LensAI telah memproses data pasar emiten ini.';
}
