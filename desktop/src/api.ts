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

export async function loginDesktop(email: string, password: string): Promise<{ ok: boolean; role?: string; email?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/desktop/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      return { ok: false, error: json.error || json.message || 'Login gagal. Periksa email & password Anda.' };
    }

    saveSession({
      email: json.email || email,
      role: json.role || 'user',
      token: json.token,
    });

    return { ok: true, role: json.role, email: json.email };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Koneksi ke server SahamLens terputus.' };
  }
}

function getAuthHeader(): Record<string, string> {
  const session = getSavedSession();
  if (session.token) {
    return { Authorization: `Bearer ${session.token}` };
  }
  return {};
}

// 1. LIVE MARKET PULSE & SUMMARY
export async function fetchMarketData(): Promise<MarketPulse | null> {
  try {
    const [pulseRes, summaryRes] = await Promise.all([
      fetch(`${API_BASE}/api/market-pulse`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${API_BASE}/api/market-summary`).then((r) => (r.ok ? r.json() : null)),
    ]);

    const reg = summaryRes?.marketRegime || pulseRes?.marketRegime;
    return {
      ihsg: reg ? {
        price: reg.price || 6640.6,
        change: reg.changePct || -0.4,
        pointChange: reg.pointChange || -27.1,
      } : undefined,
      regime: pulseRes?.marketRegime?.regime?.label || summaryRes?.marketRegime?.trend || 'Divergence',
      breadth: pulseRes?.breadth,
      topGainers: summaryRes?.topGainers || [],
      topLosers: summaryRes?.topLosers || [],
      topVolume: summaryRes?.topVolume || [],
    };
  } catch (err) {
    console.error('Failed to fetch market data', err);
    return null;
  }
}

export async function fetchMarketPulse(): Promise<MarketPulse | null> {
  return fetchMarketData();
}

// 2. CANDLESTICK CHART HISTORY
export async function fetchTechnicalChart(ticker: string, timeframe = '1Y'): Promise<any[]> {
  try {
    const clean = ticker.replace('.JK', '');
    const res = await fetch(`${API_BASE}/api/public-chart/${encodeURIComponent(clean)}.JK?tf=${timeframe}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data?.data?.history || data?.history || [];
  } catch (err) {
    console.error('Failed to fetch chart', err);
    return [];
  }
}

// 3. EMITEN DETAIL & OVERVIEW
export async function fetchStockOverview(ticker: string): Promise<any> {
  try {
    const headers = getAuthHeader();
    const res = await fetch(`${API_BASE}/api/stock/${encodeURIComponent(ticker)}`, { headers });
    const json = await res.json();
    if (!res.ok && res.status === 401) {
      return { requiresAuth: true, error: 'Silakan masuk dengan akun Anda untuk melihat ringkasan penuh emiten ini.' };
    }
    return json?.data || json;
  } catch (err: any) {
    return { error: err.message };
  }
}

// 4. FUNDAMENTAL DATA (BEI XBRL PIT)
export async function fetchFundamental(ticker: string): Promise<any> {
  try {
    const headers = getAuthHeader();
    const res = await fetch(`${API_BASE}/api/fundamental/${encodeURIComponent(ticker)}`, { headers });
    const json = await res.json();
    return json?.data || json;
  } catch (err: any) {
    return { error: err.message };
  }
}

// 5. DCF VALUATION & MARGIN OF SAFETY
export async function fetchValuationDCF(ticker: string): Promise<any> {
  try {
    const headers = getAuthHeader();
    const res = await fetch(`${API_BASE}/api/dcf/${encodeURIComponent(ticker)}`, { headers });
    const json = await res.json();
    return json;
  } catch (err: any) {
    return { error: err.message };
  }
}

// 6. OWNERSHIP FLOW (KSEI SCRIPLESS & FOREIGN)
export async function fetchOwnershipFlow(ticker: string): Promise<any> {
  try {
    const headers = getAuthHeader();
    const res = await fetch(`${API_BASE}/api/ownership-flow/${encodeURIComponent(ticker)}`, { headers });
    const json = await res.json();
    return json;
  } catch (err: any) {
    return { error: err.message };
  }
}

// 7. BREAKOUT RADAR
export async function fetchBreakoutRadar(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}/api/breakout-radar`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    return json?.data || json?.candidates || json?.items || [];
  } catch (err) {
    console.error('Failed to fetch radar', err);
    return [];
  }
}

// 8. SCREENER PRO
export async function fetchScreener(profile = 'Moderat'): Promise<any> {
  try {
    const headers = getAuthHeader();
    const res = await fetch(`${API_BASE}/api/screener?profile=${encodeURIComponent(profile)}`, { headers });
    const json = await res.json();
    return json?.data?.analysis || json?.analysis || json?.data || json;
  } catch (err: any) {
    return { error: err.message };
  }
}

// 9. NEWS & SENTIMENT
export async function fetchNews(): Promise<any[]> {
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

// 10. CORPORATE CALENDAR
export async function fetchCalendar(): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/api/calendar`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    return json?.events || {};
  } catch (err) {
    console.error('Failed to fetch calendar', err);
    return {};
  }
}

// 11. MACRO ECONOMIC CONTEXT
export async function fetchMacro(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}/api/macro`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    return json?.market || [];
  } catch (err) {
    console.error('Failed to fetch macro', err);
    return [];
  }
}

// 12. QUANT BACKTEST (SERVER SIMULATION)
export async function fetchServerBacktest(symbol: string, periodMonths: number, filter: string): Promise<any> {
  const session = getSavedSession();
  try {
    const res = await fetch(`${API_BASE}/api/backtest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: JSON.stringify({
        symbol: symbol.replace('.JK', ''),
        filters: [filter],
        modal: 100_000_000,
        period: periodMonths,
      }),
    });
    const json = await res.json();
    return json;
  } catch (err: any) {
    return { error: err.message };
  }
}

// 13. WATCHLIST (AUTHENTICATED)
export async function fetchWatchlist(): Promise<any[]> {
  const session = getSavedSession();
  if (!session.token) return [];
  try {
    const res = await fetch(`${API_BASE}/api/watchlist/desktop`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const json = await res.json();
    return json?.watchlist || json?.items || json || [];
  } catch {
    return [];
  }
}

export async function addToWatchlist(symbol: string): Promise<boolean> {
  const session = getSavedSession();
  if (!session.token) return false;
  try {
    const res = await fetch(`${API_BASE}/api/watchlist/desktop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ symbol }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// 14. ADMIN OVERVIEW (ROLE: ADMIN)
export async function fetchAdminOverview(): Promise<any> {
  const session = getSavedSession();
  if (session.role !== 'admin' || !session.token) {
    return { forbidden: true, error: 'Akses khusus Administrator.' };
  }
  try {
    const res = await fetch(`${API_BASE}/api/admin/desktop-overview`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const json = await res.json();
    return json?.data || json;
  } catch (err: any) {
    return { error: err.message };
  }
}

// 15. TICKER SEARCH AUTOCOMPLETE
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
