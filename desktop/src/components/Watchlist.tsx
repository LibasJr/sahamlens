import { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, Crosshair, Eye, LayoutGrid, Plus, Search, Star } from 'lucide-react';
import type { Ticker } from '../main';
import { getToken, saveWatchlist } from '../tokenStore';
import { apiFetch } from '../api';

type Props = { stocks: Ticker[]; selected: string; onSelect: (symbol: string) => void; onChange: (stocks: Ticker[]) => void; onAuthenticated: () => void };
export function Watchlist({ stocks, selected, onSelect, onChange, onAuthenticated }: Props) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [loginError, setLoginError] = useState(''); const [loggingIn, setLoggingIn] = useState(false);
  const sorted = useMemo(() => stocks, [stocks]);
  const addSymbol = async () => {
    const symbol = window.prompt('Ticker saham baru')?.trim().toUpperCase();
    if (!symbol || stocks.some((stock) => stock.symbol === symbol)) return;
    const token = await getToken();
    const response = await apiFetch(`${import.meta.env.VITE_API_BASE_URL ?? 'https://sahamlens.id'}/api/watchlist`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ symbol }) });
    if (!response.ok) return;
    const next = [...stocks, { symbol, name: symbol, price: null, change: null }];
    onChange(next); void saveWatchlist(next);
  };
  const login = async () => {
    setLoggingIn(true); setLoginError('');
    try { const response = await apiFetch(`${import.meta.env.VITE_API_BASE_URL ?? 'https://sahamlens.id'}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error ?? 'Login gagal'); onAuthenticated(); }
    catch (reason) { setLoginError(reason instanceof Error ? reason.message : 'Login gagal'); } finally { setLoggingIn(false); }
  };
  return <aside className="watchlist-panel">
    <div className="rail"><div className="rail-logo">S</div><button className="rail-button active"><LayoutGrid size={17} /></button><button className="rail-button"><BarChart3 size={17} /></button><button className="rail-button"><Crosshair size={17} /></button><button className="rail-button"><Star size={17} /></button><div className="rail-spacer" /><button className="rail-button"><Eye size={17} /></button></div>
    <div className="watchlist-content">
      <div className="watchlist-heading"><div><span className="section-kicker">MARKETS</span><h2>Watchlist</h2></div><button className="icon-button" aria-label="Tambah saham" onClick={addSymbol}><Plus size={16} /></button></div>
      <div className="watchlist-toolbar"><button className="filter-button">My Watchlist <ChevronDown size={13} /></button><button className="search-button" aria-label="Cari saham"><Search size={14} /></button></div>
      <div className="watchlist-list">{sorted.length === 0 ? <div className="login-box"><div className="data-empty">Login untuk memuat watchlist dan fitur akun.</div><input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" /><input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" onKeyDown={e => { if (e.key === 'Enter') void login(); }} /><button className="primary-action" onClick={() => void login()} disabled={loggingIn}>{loggingIn ? 'Memproses…' : 'Login'}</button>{loginError && <small className="login-error">{loginError}</small>}</div> : sorted.map((stock) => <button className={`watchlist-row ${selected === stock.symbol ? 'selected' : ''}`} key={stock.symbol} onClick={() => onSelect(stock.symbol)}><span className="ticker-avatar">{stock.symbol.slice(0, 1)}</span><span className="ticker-meta"><strong>{stock.symbol}</strong><small>{stock.name}</small></span><span className="ticker-quote"><strong>{stock.price != null ? `Rp ${stock.price.toLocaleString('id-ID')}` : '—'}</strong><small className={stock.change != null && stock.change >= 0 ? 'positive' : 'negative'}>{stock.change == null ? 'N/A' : `${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%`}</small></span></button>)}</div>
      <div className="watchlist-footer"><span className="live-dot" /> Live market data</div>
    </div>
  </aside>;
}
