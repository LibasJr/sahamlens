import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Ticker } from '../main';

type Props = { stocks: Ticker[]; selected: string; onSelect: (symbol: string) => void; onChange: (stocks: Ticker[]) => void; onAddSymbol?: (symbol: string) => Promise<void>; syncError?: string; savedSymbols?: string[] };
export function Watchlist({ stocks, selected, onSelect, onChange, onAddSymbol, syncError, savedSymbols = [] }: Props) {
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => stocks.filter((stock) => stock.symbol.includes(query.trim().toUpperCase())), [stocks, query]);
  const addSymbol = async () => {
    const symbol = window.prompt('Ticker saham baru')?.trim().toUpperCase();
    if (!symbol) return;
    try { await onAddSymbol?.(symbol); if (!stocks.some((stock) => stock.symbol === symbol)) onChange([...stocks, { symbol, name: symbol, price: null, change: null }]); onSelect(symbol); } catch { /* Error sinkronisasi ditampilkan oleh parent. */ }
  };
  return <aside className="watchlist-panel">
    <div className="watchlist-content">
      <div className="watchlist-heading"><div><span className="section-kicker">PASAR HARI INI</span><h2>Daftar pantau</h2></div><button className="icon-button" aria-label="Tambah ticker" onClick={addSymbol}><Plus size={16} /></button></div>
      <label className="ticker-search"><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari ticker" aria-label="Cari ticker" /></label>
      <div className="watchlist-list">{sorted.length === 0 ? <div className="data-empty">Memuat kandidat pasar atau ticker tidak ditemukan.</div> : sorted.map((stock) => <button className={`watchlist-row ${selected === stock.symbol ? 'selected' : ''}`} key={stock.symbol} onClick={() => onSelect(stock.symbol)}><span className="ticker-avatar">{stock.symbol.slice(0, 1)}</span><span className="ticker-meta"><strong>{stock.symbol}</strong><small>{savedSymbols.includes(stock.symbol) ? 'Tersimpan di akun' : stock.name}</small></span><span className="ticker-quote"><strong>{stock.price != null ? `Rp ${stock.price.toLocaleString('id-ID')}` : '—'}</strong><small className={stock.change != null && stock.change >= 0 ? 'positive' : 'negative'}>{stock.change == null ? '—' : `${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%`}</small></span></button>)}</div>
      <div className={`watchlist-footer${syncError ? ' error' : ''}`}><span className="live-dot" /> {syncError || 'Daftar pantau tersinkron saat akun desktop aktif'}</div>
    </div>
  </aside>;
}
