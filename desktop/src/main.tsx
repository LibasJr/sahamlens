import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { API_BASE_URL, checkHealth, getMarketPulse, type HealthState, type MarketPulse } from './api';
import { ViewToggle, DetailHint } from './components';
import './styles.css';

type Stock = { code: string; name: string; price: string; change: string; positive?: boolean };
const stocks: Stock[] = [
  { code: 'BBCA', name: 'Bank Central Asia', price: '9.425', change: '+1,08%', positive: true },
  { code: 'BMRI', name: 'Bank Mandiri', price: '5.375', change: '+0,94%', positive: true },
  { code: 'TLKM', name: 'Telkom Indonesia', price: '2.680', change: '-0,74%' },
];
const menu = ['Overview', 'Market Pulse', 'Watchlist', 'Screener', 'Teknikal', 'Fundamental', 'Decision Lab'];

function App() {
  const [active, setActive] = useState('Overview');
  const [detail, setDetail] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [health, setHealth] = useState<HealthState>('checking');
  const [pulse, setPulse] = useState<MarketPulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshMarket = () => { setRefreshing(true); setError(false); getMarketPulse(API_BASE_URL).then(setPulse).catch(() => setError(true)).finally(() => setRefreshing(false)); };
  useEffect(() => {
    let mounted = true;
    checkHealth(API_BASE_URL).then((state) => { if (mounted) setHealth(state); });
    const loadPulse = () => getMarketPulse(API_BASE_URL).then((data) => { if (mounted) { setPulse(data); setError(false); } }).catch(() => { if (mounted) setError(true); }).finally(() => { if (mounted) setLoading(false); });
    loadPulse();
    const timer = window.setInterval(loadPulse, 60_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);
  const connectionLabel = health === 'connected' ? 'Data tersambung' : health === 'offline' ? 'Koneksi terputus' : 'Memeriksa koneksi';
  return <div className="terminal">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">S</span><b>SahamLens</b></div><div className="workspace">INDONESIA MARKET</div><nav>{menu.map((item) => <button key={item} onClick={() => setActive(item)} className={active === item ? 'nav active' : 'nav'}><span className="nav-dot" />{item}</button>)}</nav><div className="profile"><div className="avatar">L</div><div><b>Libas</b><small>Personal workspace</small></div><span>⋮</span></div></aside>
    <main className="main"><header className="header"><div><p className="eyebrow">MONDAY, 30 AUGUST 2026</p><h1>{active}</h1></div><div className="actions"><button className="search" onClick={() => setSearchOpen(!searchOpen)}>⌕&nbsp; {query || 'Search stock'} <kbd>⌘ K</kbd></button>{searchOpen && <div className="search-box"><input autoFocus className="search-input" value={query} onChange={(e) => setQuery(e.target.value.toUpperCase())} placeholder="Ticker, mis. BBCA" aria-label="Cari saham" />{query && <div className="search-results">{stocks.filter((s) => `${s.code} ${s.name}`.includes(query)).map((s) => <button key={s.code} onClick={() => { setQuery(s.code); setSearchOpen(false); }}><b>{s.code}</b><small>{s.name}</small></button>)}{!stocks.some((s) => `${s.code} ${s.name}`.includes(query)) && <span>Tidak ditemukan</span>}</div>}</div>}<button className="icon" onClick={refreshMarket} aria-label="Refresh data market">{refreshing ? '…' : '↻'}</button><button className="icon">⚙</button><div className={`connection ${health}`}><i />{connectionLabel}</div><ViewToggle detail={detail} onChange={setDetail} /></div></header>
      <section className="market-head"><div><p className="eyebrow">MARKET OVERVIEW</p><h2>Market at a glance</h2></div><div className="market-tabs"><button className="selected">IDX</button><button>US</button><button>Watchlist</button></div></section><DetailHint detail={detail}>Mode detail menampilkan konteks tambahan untuk membantu membaca data pasar dan risiko. Angka utama tetap berasal dari API SahamLens.</DetailHint>
       <section className="metrics"><Metric label="IHSG" value="7.812,34" change="+0,62%" /><Metric label="Foreign Flow" value="+Rp 284,6 M" change="Net Buy" positive /><Metric label="Market Breadth" value="187 / 142" change="Advancers / Decliners" /></section>
      <div className="columns"><section className="panel chart-panel"><div className="panel-title"><div><p className="eyebrow">IHSG · 1D</p><h3>7.812,34 <span className="gain">+48,20 (+0,62%)</span></h3></div><button className="ghost">1D⌄</button></div><div className="chart"><div className="grid-lines" /><svg viewBox="0 0 700 230" preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#39d0b1" stopOpacity=".26"/><stop offset="1" stopColor="#39d0b1" stopOpacity="0"/></linearGradient></defs><path d="M0 190 C50 170 65 180 105 155 S160 160 195 130 S240 145 280 110 S340 125 380 90 S420 120 460 76 S510 100 545 65 S600 90 640 42 S675 62 700 25 V230 H0Z" fill="url(#fill)"/><path d="M0 190 C50 170 65 180 105 155 S160 160 195 130 S240 145 280 110 S340 125 380 90 S420 120 460 76 S510 100 545 65 S600 90 640 42 S675 62 700 25" fill="none" stroke="#39d0b1" strokeWidth="3"/></svg></div><div className="range"><span>09:00</span><span>11:00</span><span>13:00</span><span>15:00</span></div></section><section className="panel"><div className="panel-title"><div><p className="eyebrow">WATCHLIST</p><h3>My stocks</h3></div><button className="plus">＋</button></div><div className="stock-list">{stocks.map(s => <div className="stock" key={s.code}><div className="stock-logo">{s.code[0]}</div><div className="stock-name"><b>{s.code}</b><small>{s.name}</small></div><div className="stock-price"><b>Rp {s.price}</b><small className={s.positive ? 'gain' : 'loss'}>{s.change}</small></div></div>)}</div><button className="view-all">View all watchlist <span>→</span></button></section></div>
      {loading && <div className="detail-hint">Memuat data market terbaru…</div>}{error && !pulse && <div className="detail-hint">Data market belum tersedia. Coba lagi setelah koneksi pulih.</div>}
      {pulse?.topGainers?.length ? <section className="panel movers"><div className="panel-title"><div><p className="eyebrow">TOP GAINERS</p><h3>Saham terkuat hari ini</h3></div></div><div className="mover-list">{pulse.topGainers.slice(0, 5).map((item) => <div className="mover" key={item.symbol}><b>{item.symbol}</b><span>Rp {item.price.toLocaleString('id-ID')}</span><strong className="gain">+{item.changePct.toFixed(2)}%</strong></div>)}</div></section> : null}
      <section className="bottom-row"><div className="section-label"><p className="eyebrow">TODAY'S SIGNALS</p><h2>What needs your attention</h2></div><div className="signal"><span className="signal-icon green">↗</span><div><b>Strong momentum</b><p>BBCA is showing positive accumulation</p></div><span className="arrow">→</span></div><div className="signal"><span className="signal-icon yellow">!</span><div><b>Review needed</b><p>3 stocks have stale data</p></div><span className="arrow">→</span></div></section>
    </main>
  </div>;
}
function Metric({label, value, change, positive}: {label:string; value:string; change:string; positive?:boolean}) { return <article className="metric"><span>{label}</span><strong>{value}</strong><small className={positive ? 'gain' : ''}>{change}</small></article>; }
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
