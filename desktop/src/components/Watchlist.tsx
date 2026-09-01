import { useMemo, useState } from 'react';
import { BarChart3, Crosshair, Eye, LayoutGrid, Plus, Search, Star } from 'lucide-react';
import type { Ticker } from '../main';

type Props = { stocks: Ticker[]; selected: string; onSelect: (symbol: string) => void; onChange: (stocks: Ticker[]) => void };
export function Watchlist({ stocks, selected, onSelect, onChange }: Props) {
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => stocks.filter((stock) => stock.symbol.includes(query.trim().toUpperCase())), [stocks, query]);
  const addSymbol = () => {
    const symbol = window.prompt('Ticker saham baru')?.trim().toUpperCase();
    if (!symbol || stocks.some((stock) => stock.symbol === symbol)) return;
    const next = [...stocks, { symbol, name: symbol, price: null, change: null }];
    onChange(next); onSelect(symbol);
  };
  return <aside className="watchlist-panel">
    <div className="rail"><div className="rail-logo">S</div><button className="rail-button active"><LayoutGrid size={17} /></button><button className="rail-button"><BarChart3 size={17} /></button><button className="rail-button"><Crosshair size={17} /></button><button className="rail-button"><Star size={17} /></button><div className="rail-spacer" /><button className="rail-button"><Eye size={17} /></button></div>
    <div className="watchlist-content">
      <div className="watchlist-heading"><div><span className="section-kicker">PASAR HARI INI</span><h2>Daftar pantau</h2></div><button className="icon-button" aria-label="Tambah ticker" onClick={addSymbol}><Plus size={16} /></button></div>
      <label className="ticker-search"><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari ticker" aria-label="Cari ticker" /></label>
      <div className="watchlist-list">{sorted.length === 0 ? <div className="data-empty">Memuat kandidat pasar atau ticker tidak ditemukan.</div> : sorted.map((stock) => <button className={`watchlist-row ${selected === stock.symbol ? 'selected' : ''}`} key={stock.symbol} onClick={() => onSelect(stock.symbol)}><span className="ticker-avatar">{stock.symbol.slice(0, 1)}</span><span className="ticker-meta"><strong>{stock.symbol}</strong><small>{stock.name}</small></span><span className="ticker-quote"><strong>{stock.price != null ? `Rp ${stock.price.toLocaleString('id-ID')}` : '—'}</strong><small className={stock.change != null && stock.change >= 0 ? 'positive' : 'negative'}>{stock.change == null ? '—' : `${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%`}</small></span></button>)}</div>
      <div className="watchlist-footer"><span className="live-dot" /> Data publik SahamLens</div>
    </div>
  </aside>;
}
