import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { API_BASE_URL, checkHealth, getWatchlist, type HealthState, type WatchlistItem } from './api';
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
  const [health, setHealth] = useState<HealthState>('checking');
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  useEffect(() => {
    let mounted = true;
    checkHealth(API_BASE_URL).then((state) => { if (mounted) setHealth(state); });
    getWatchlist(API_BASE_URL).then((items) => { if (mounted) setWatchlist(items); }).catch(() => { if (mounted) setWatchlist([]); });
    return () => { mounted = false; };
  }, []);
  const connectionLabel = health === 'connected' ? 'Data tersambung' : health === 'offline' ? 'Koneksi terputus' : 'Memeriksa koneksi';
  return <div className="terminal">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">S</span><b>SahamLens</b></div><div className="workspace">INDONESIA MARKET</div><nav>{menu.map((item) => <button key={item} onClick={() => setActive(item)} className={active === item ? 'nav active' : 'nav'}><span className="nav-dot" />{item}</button>)}</nav><div className="profile"><div className="avatar">L</div><div><b>Libas</b><small>Personal workspace</small></div><span>⋮</span></div></aside>
    <main className="main"><header className="header"><div><p className="eyebrow">MONDAY, 30 AUGUST 2026</p><h1>{active}</h1></div><div className="actions"><button className="search">⌕&nbsp; Search stock <kbd>⌘ K</kbd></button><button className="icon">◔</button><button className="icon">⚙</button><div className={`connection ${health}`}><i />{connectionLabel}</div></div></header>
      <section className="market-head"><div><p className="eyebrow">MARKET OVERVIEW</p><h2>Market at a glance</h2></div><div className="market-tabs"><button className="selected">IDX</button><button>US</button><button>Watchlist</button></div></section>
      <section className="metrics"><Metric label="IHSG" value="7.812,34" change="+0,62%" /><Metric label="Foreign Flow" value="+Rp 284,6 M" change="Net Buy" positive /><Metric label="Market Breadth" value="187 / 142" change="Advancers / Decliners" /></section>
      <div className="columns"><section className="panel chart-panel"><div className="panel-title"><div><p className="eyebrow">IHSG · 1D</p><h3>7.812,34 <span className="gain">+48,20 (+0,62%)</span></h3></div><button className="ghost">1D⌄</button></div><div className="chart"><div className="grid-lines" /><svg viewBox="0 0 700 230" preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#39d0b1" stopOpacity=".26"/><stop offset="1" stopColor="#39d0b1" stopOpacity="0"/></linearGradient></defs><path d="M0 190 C50 170 65 180 105 155 S160 160 195 130 S240 145 280 110 S340 125 380 90 S420 120 460 76 S510 100 545 65 S600 90 640 42 S675 62 700 25 V230 H0Z" fill="url(#fill)"/><path d="M0 190 C50 170 65 180 105 155 S160 160 195 130 S240 145 280 110 S340 125 380 90 S420 120 460 76 S510 100 545 65 S600 90 640 42 S675 62 700 25" fill="none" stroke="#39d0b1" strokeWidth="3"/></svg></div><div className="range"><span>09:00</span><span>11:00</span><span>13:00</span><span>15:00</span></div></section><section className="panel"><div className="panel-title"><div><p className="eyebrow">WATCHLIST</p><h3>My stocks</h3></div><button className="plus">＋</button></div><div className="stock-list">{(watchlist.length ? watchlist : stocks).map(s => { const code = 'code' in s ? s.code : s.symbol; const name = 'name' in s ? s.name : undefined; const price = 'price' in s ? s.price : undefined; const change = 'change' in s ? s.change : undefined; const changePct = 'changePct' in s ? s.changePct : undefined; return <div className="stock" key={code}><div className="stock-logo">{code[0]}</div><div className="stock-name"><b>{code}</b><small>{name ?? 'Saham pilihan'}</small></div><div className="stock-price"><b>{price !== undefined ? `Rp ${price.toLocaleString('id-ID')}` : '—'}</b><small className={(changePct ?? (change?.startsWith('+') ? 1 : -1)) >= 0 ? 'gain' : 'loss'}>{changePct !== undefined ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : change ?? 'Menunggu data'}</small></div></div>; })}</div><button className="view-all">View all watchlist <span>→</span></button></section></div>
      <section className="bottom-row"><div className="section-label"><p className="eyebrow">TODAY'S SIGNALS</p><h2>What needs your attention</h2></div><div className="signal"><span className="signal-icon green">↗</span><div><b>Strong momentum</b><p>BBCA is showing positive accumulation</p></div><span className="arrow">→</span></div><div className="signal"><span className="signal-icon yellow">!</span><div><b>Review needed</b><p>3 stocks have stale data</p></div><span className="arrow">→</span></div></section>
    </main>
  </div>;
}
function Metric({label, value, change, positive}: {label:string; value:string; change:string; positive?:boolean}) { return <article className="metric"><span>{label}</span><strong>{value}</strong><small className={positive ? 'gain' : ''}>{change}</small></article>; }
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
