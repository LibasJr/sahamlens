import { useMemo, useState } from 'react';
import { Plus, Search, Trash2, Undo2 } from 'lucide-react';
import type { Ticker } from '../main';
import { formatIdr } from '../format';
import { searchTickers, type TickerSearchItem } from '../api';

type Props = {
  stocks: Ticker[];
  recommendations: Ticker[];
  selected: string;
  authenticated: boolean;
  onSelect: (symbol: string) => void;
  onAddSymbol: (symbol: string, name?: string) => Promise<void>;
  onRemoveSymbol: (symbol: string) => Promise<void>;
  syncError?: string;
};

export function Watchlist({ stocks, recommendations, selected, authenticated, onSelect, onAddSymbol, onRemoveSymbol, syncError }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TickerSearchItem[]>([]);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const filtered = useMemo(() => stocks.filter((stock) => `${stock.symbol} ${stock.name}`.toLowerCase().includes(query.trim().toLowerCase())), [stocks, query]);
  const find = async (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) return setResults([]);
    try { setResults(await searchTickers(value)); } catch { setResults([]); }
  };
  const add = async (symbol: string, name?: string) => {
    if (!authenticated || stocks.some((stock) => stock.symbol === symbol)) return;
    setBusy(symbol);
    try { await onAddSymbol(symbol, name); setQuery(''); setResults([]); } finally { setBusy(''); }
  };
  const remove = async (symbol: string) => {
    setBusy(symbol);
    try { await onRemoveSymbol(symbol); setPendingDelete(null); } finally { setBusy(''); }
  };
  return <aside className="watchlist-panel"><div className="watchlist-content">
    <div className="watchlist-heading"><div><span className="section-kicker">PASAR HARI INI</span><h2>Daftar Pantau</h2></div></div>
    <label className="ticker-search"><Search size={14} /><input value={query} onChange={(event) => void find(event.target.value)} placeholder="Cari kode atau nama emiten" aria-label="Cari emiten untuk daftar pantau" /></label>
    {results.length > 0 && <div className="watchlist-search-results">{results.slice(0, 6).map((item) => <button key={item.symbol} disabled={!authenticated || busy === item.symbol || stocks.some((stock) => stock.symbol === item.symbol)} onClick={() => void add(item.symbol, item.name)}><span><strong>{item.symbol}</strong><small>{item.name}</small></span><Plus size={15} /></button>)}</div>}
    {!authenticated ? <div className="data-empty">Daftar atau masuk untuk membuat Daftar Pantau pribadi.</div> : filtered.length === 0 ? <div className="data-empty">Belum ada emiten di Daftar Pantau. Cari emiten di atas atau pilih rekomendasi di bawah.</div> : <div className="watchlist-list">{filtered.map((stock) => <div className={`watchlist-row-wrap ${selected === stock.symbol ? 'selected' : ''}`} key={stock.symbol}><button className="watchlist-row" onClick={() => onSelect(stock.symbol)}><span className="ticker-avatar">{stock.symbol.slice(0, 1)}</span><span className="ticker-meta"><strong>{stock.symbol}</strong><small>{stock.name}</small></span><span className="ticker-quote"><strong>{formatIdr(stock.price)}</strong><small className={stock.change != null && stock.change >= 0 ? 'positive' : 'negative'}>{stock.change == null ? '—' : `${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%`}</small></span></button>{pendingDelete === stock.symbol ? <span className="watchlist-delete-confirm"><button onClick={() => void remove(stock.symbol)} disabled={busy === stock.symbol}>Hapus</button><button aria-label={`Batal hapus ${stock.symbol}`} onClick={() => setPendingDelete(null)}><Undo2 size={14} /></button></span> : <button className="watchlist-remove" aria-label={`Hapus ${stock.symbol} dari Daftar Pantau`} onClick={() => setPendingDelete(stock.symbol)}><Trash2 size={14} /></button>}</div>)}</div>}
    <section className="watchlist-recommendations"><span className="section-kicker">REKOMENDASI UNTUK DIPANTAU</span>{recommendations.filter((item) => !stocks.some((stock) => stock.symbol === item.symbol)).slice(0, 5).map((item) => <button key={item.symbol} disabled={!authenticated || busy === item.symbol} onClick={() => void add(item.symbol, item.name)}><span><strong>{item.symbol}</strong><small>{item.change == null ? 'Data pasar' : `${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)}%`}</small></span><Plus size={14} /></button>)}</section>
    <div className={`watchlist-footer${syncError ? ' error' : ''}`}>{syncError || 'Daftar Pantau dikelola manual dan tersimpan per akun.'}</div>
  </div></aside>;
}
