import { Search, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { searchTickers, type TickerSearchItem } from '../api';

export type ExperienceMode = 'guided' | 'focus' | 'pro';

type Props = {
  apiStatus: 'checking' | 'online' | 'offline';
  mode: ExperienceMode;
  onModeChange: (mode: ExperienceMode) => void;
  onSearch: (symbol: string, name?: string) => void;
  onToggleWatchlist: () => void;
  onToggleInsight: () => void;
  accountEmail?: string;
  onOpenAccount: () => void;
};

export function GlobalHeader({ apiStatus, mode, onModeChange, onSearch, onToggleWatchlist, onToggleInsight, accountEmail, onOpenAccount }: Props) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<TickerSearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchError, setSearchError] = useState('');
  const searchId = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (!value) { setItems([]); setOpen(false); setSearchError(''); return; }
    const requestId = ++searchId.current;
    const timeout = window.setTimeout(() => {
      void searchTickers(value)
        .then((next) => {
          if (requestId !== searchId.current) return;
          setItems(next);
          setActiveIndex(0);
          setSearchError('');
          setOpen(true);
        })
        .catch(() => {
          if (requestId !== searchId.current) return;
          setItems([]);
          setSearchError('Pencarian emiten tidak dapat terhubung ke SahamLens.');
          setOpen(true);
        });
    }, 140);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const choose = (item: TickerSearchItem) => { setQuery(item.symbol); setOpen(false); onSearch(item.symbol, item.name); };
  const submit = () => { const candidate = items[activeIndex]; if (open && candidate) choose(candidate); else if (query.trim()) onSearch(query.trim()); };
  const statusLabel = apiStatus === 'online' ? 'API terhubung' : apiStatus === 'offline' ? 'API offline' : 'Memeriksa API';

  return <header className="global-header">
    <form className="global-search" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <Search size={16} />
      <input ref={searchInput} name="symbol" value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => { if (query.trim()) setOpen(true); }} onBlur={() => window.setTimeout(() => setOpen(false), 140)} onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); return; } if (!items.length) return; if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, items.length - 1)); setOpen(true); } if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); } }} placeholder="Cari saham atau emiten, contoh: BBCA" autoComplete="off" aria-label="Cari saham" aria-expanded={open} aria-controls="ticker-search-results" />
      <kbd>Ctrl/⌘ K</kbd>
      {open && <div id="ticker-search-results" className="ticker-suggestions" role="listbox" aria-label="Hasil pencarian emiten">
        {searchError ? <div className="ticker-suggestions-empty error" role="alert">{searchError}</div> : items.length ? items.map((item, index) => <button type="button" key={item.symbol} className={index === activeIndex ? 'active' : ''} role="option" aria-selected={index === activeIndex} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}><strong>{item.symbol}</strong><span>{item.name}</span></button>) : <div className="ticker-suggestions-empty">Ticker atau nama emiten tidak ditemukan.</div>}
      </div>}
    </form>
    <div className="header-actions"><div className="mode-switch" aria-label="Mode tampilan">{(['guided', 'focus', 'pro'] as const).map((item) => <button key={item} className={mode === item ? 'active' : ''} onClick={() => onModeChange(item)}>{item === 'guided' ? 'Guided' : item === 'focus' ? 'Focus' : 'Pro'}</button>)}</div><span className={`api-chip ${apiStatus}`} title={statusLabel}>{apiStatus === 'offline' ? <WifiOff size={13} /> : <Wifi size={13} />}{statusLabel}</span><button onClick={onToggleWatchlist}>Watchlist</button><button onClick={onToggleInsight}>Insight</button><button className="profile-chip" aria-label={accountEmail ? `Akun ${accountEmail}` : 'Masuk ke akun'} title={accountEmail ?? 'Masuk'} onClick={onOpenAccount}>{accountEmail ? accountEmail.slice(0, 1).toUpperCase() : 'Masuk'}</button></div>
  </header>;
}
