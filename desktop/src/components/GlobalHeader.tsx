import { Search, Wifi, WifiOff } from 'lucide-react';

export function GlobalHeader({ apiStatus, onSearch, onToggleWatchlist, onToggleInsight }: { apiStatus: 'checking' | 'online' | 'offline'; onSearch: (symbol: string) => void; onToggleWatchlist: () => void; onToggleInsight: () => void }) {
  const submit = (form: HTMLFormElement) => { const symbol = new FormData(form).get('symbol')?.toString().trim(); if (symbol) onSearch(symbol); };
  const statusLabel = apiStatus === 'online' ? 'API terhubung' : apiStatus === 'offline' ? 'API offline' : 'Memeriksa API';
  return <header className="global-header">
    <form className="global-search" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }}><Search size={16} /><input name="symbol" placeholder="Cari saham, contoh: BBCA" autoComplete="off" aria-label="Cari saham" /><kbd>⌘ K</kbd></form>
    <div className="header-actions"><span className={`api-chip ${apiStatus}`} title={statusLabel}>{apiStatus === 'offline' ? <WifiOff size={13} /> : <Wifi size={13} />}{statusLabel}</span><button onClick={onToggleWatchlist}>Watchlist</button><button onClick={onToggleInsight}>Insight</button><button className="profile-chip" aria-label="Profil akun">SL</button></div>
  </header>;
}
