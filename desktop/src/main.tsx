import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { API_BASE_URL, checkHealth, getMarketPulse, type HealthState, type MarketPulse } from './api';
import { ViewToggle, DetailHint } from './components';
import './styles.css';

type Stock = { code: string; name: string; price: string; change: string; positive?: boolean };

const menu = ['Overview', 'Market Pulse', 'Watchlist', 'Screener', 'Teknikal', 'Fundamental', 'Decision Lab'];

function App() {
  const [active, setActive] = useState('Overview');
  const [detail, setDetail] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [marketTab, setMarketTab] = useState('IDX');
  const [chartRange, setChartRange] = useState('1D');
  const selectSearchResult = () => { const match = stocks.find((s) => `${s.code} ${s.name}`.includes(query)); if (match) { setQuery(match.code); setSearchOpen(false); } };
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
  const benchmark = pulse?.indices?.find((item) => item.symbol === 'IHSG') ?? pulse?.indices?.[0];
  const benchmarkPrice = benchmark?.price ?? 0;
  const benchmarkChange = benchmark?.changePct ?? 0;
  const formatPrice = (value: number) => value.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const changeLabel = `${benchmarkChange >= 0 ? '+' : ''}${benchmarkChange.toFixed(2).replace('.', ',')}%`;
  const stocks: Stock[] = [...(pulse?.topGainers ?? []), ...(pulse?.topLosers ?? [])].slice(0, 3).map((item) => ({ code: item.symbol, name: item.symbol, price: item.price.toLocaleString('id-ID'), change: `${item.changePct >= 0 ? '+' : ''}${item.changePct.toFixed(2).replace('.', ',')}%`, positive: item.changePct >= 0 }));
  return <div className="terminal">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">S</span><b>SahamLens</b></div><div className="workspace">INDONESIA MARKET</div><nav>{menu.map((item) => <button key={item} onClick={() => setActive(item)} className={active === item ? 'nav active' : 'nav'}><span className="nav-dot" />{item}</button>)}</nav><div className="profile"><div className="avatar">L</div><div><b>Libas</b><small>Personal workspace</small></div><span>⋮</span></div></aside>
    <main className="main"><header className="header"><div><p className="eyebrow">{new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase()}</p><h1>{active}</h1></div><div className="actions"><button className="search" onClick={() => setSearchOpen(!searchOpen)}>⌕&nbsp; Search stock <kbd>⌘ K</kbd></button>{searchOpen && <div className="search-box"><input autoFocus className="search-input" value={query} onChange={(e) => setQuery(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') selectSearchResult(); }} placeholder="Ticker, mis. BBCA" aria-label="Cari saham" />{query && <div className="search-results">{stocks.filter((s) => `${s.code} ${s.name}`.includes(query)).map((s) => <button key={s.code} onClick={() => { setQuery(s.code); setSearchOpen(false); }}><b>{s.code}</b><small>{s.name}</small></button>)}{!stocks.some((s) => `${s.code} ${s.name}`.includes(query)) && <span>Tidak ditemukan</span>}</div>}</div>}<button className="icon" onClick={refreshMarket} aria-label="Refresh data market">{refreshing ? '…' : '↻'}</button><button className="icon" aria-label="Buka pengaturan">⚙</button><div className={`connection ${health}`}><i />{connectionLabel}</div>{pulse?.timestamp && <span className="updated-at">Diperbarui {new Date(pulse.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>}<ViewToggle detail={detail} onChange={setDetail} /></div></header>
      <section className="market-head"><div><p className="eyebrow">MARKET OVERVIEW</p><h2>{marketTab === 'IDX' ? 'Market at a glance' : marketTab === 'US' ? 'US market overview' : 'My watchlist overview'}</h2></div><div className="market-tabs" role="tablist" aria-label="Pilih pasar">{['IDX', 'US', 'Watchlist'].map((tab) => <button key={tab} className={marketTab === tab ? 'selected' : ''} aria-pressed={marketTab === tab} role="tab" onClick={() => setMarketTab(tab)}>{tab}</button>)}</div></section><DetailHint detail={detail}>Mode detail menampilkan konteks tambahan untuk membantu membaca data pasar dan risiko. Angka utama tetap berasal dari API SahamLens.</DetailHint>
       <section className="metrics"><Metric label={benchmark?.symbol ?? 'Benchmark'} value={benchmark ? formatPrice(benchmarkPrice) : '—'} change={benchmark ? changeLabel : 'Data belum tersedia'} positive={benchmarkChange >= 0} /><Metric label="Top gainers" value={pulse ? `${pulse.topGainers.length} saham` : '—'} change={pulse ? 'Data market' : 'Menunggu data'} positive /><Metric label="Top losers" value={pulse ? `${pulse.topLosers.length} saham` : '—'} change={pulse ? 'Data market' : 'Menunggu data'} /></section>
      <div className="columns"><section className="panel chart-panel"><div className="panel-title"><div><p className="eyebrow">{benchmark?.symbol ?? 'Benchmark'} · {chartRange}</p><h3>{benchmark ? formatPrice(benchmarkPrice) : '—'} <span className={benchmarkChange >= 0 ? 'gain' : 'loss'}>{benchmark ? changeLabel : 'Data belum tersedia'}</span></h3></div><select className="ghost" value={chartRange} onChange={(e) => setChartRange(e.target.value)} aria-label="Pilih rentang chart"><option>1D</option><option>1W</option><option>1M</option></select></div><div className="chart" role="img" aria-label={`Chart IHSG rentang ${chartRange}`}><div className="grid-lines" /><svg viewBox="0 0 700 230" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#39d0b1" stopOpacity=".26"/><stop offset="1" stopColor="#39d0b1" stopOpacity="0"/></linearGradient></defs><path d="M0 190 C50 170 65 180 105 155 S160 160 195 130 S240 145 280 110 S340 125 380 90 S420 120 460 76 S510 100 545 65 S600 90 640 42 S675 62 700 25 V230 H0Z" fill="url(#fill)"/><path d="M0 190 C50 170 65 180 105 155 S160 160 195 130 S240 145 280 110 S340 125 380 90 S420 120 460 76 S510 100 545 65 S600 90 640 42 S675 62 700 25" fill="none" stroke="#39d0b1" strokeWidth="3"/></svg></div><div className="range"><span>{chartRange === '1M' ? '01 Aug' : chartRange === '1W' ? 'Sen' : '09:00'}</span><span>{chartRange === '1M' ? '08 Aug' : chartRange === '1W' ? 'Rab' : '11:00'}</span><span>{chartRange === '1M' ? '15 Aug' : chartRange === '1W' ? 'Jum' : '13:00'}</span><span>{chartRange === '1M' ? '31 Aug' : chartRange === '1W' ? 'Min' : '15:00'}</span></div></section><section className="panel"><div className="panel-title"><div><p className="eyebrow">WATCHLIST</p><h3>My stocks</h3></div><button className="plus">＋</button></div><div className="stock-list">{stocks.map(s => <div className="stock" key={s.code}><div className="stock-logo">{s.code[0]}</div><div className="stock-name"><b>{s.code}</b><small>{s.name}</small></div><div className="stock-price"><b>Rp {s.price}</b><small className={s.positive ? 'gain' : 'loss'}>{s.change}</small></div></div>)}</div><button className="view-all">View all watchlist <span>→</span></button></section></div>
      {loading && <div className="detail-hint">Memuat data market terbaru…</div>}{error && !pulse && <div className="detail-hint">Data market belum tersedia. Coba lagi setelah koneksi pulih.</div>}
      {pulse?.topGainers?.length ? <section className="panel movers"><div className="panel-title"><div><p className="eyebrow">TOP GAINERS</p><h3>Saham terkuat hari ini</h3></div></div><div className="mover-list">{pulse.topGainers.slice(0, 5).map((item) => <div className="mover" key={item.symbol}><b>{item.symbol}</b><span>Rp {item.price.toLocaleString('id-ID')}</span><strong className="gain">+{item.changePct.toFixed(2)}%</strong></div>)}</div></section> : null}
      <section className="bottom-row"><div className="section-label"><p className="eyebrow">TODAY'S SIGNALS</p><h2>What needs your attention</h2></div>{pulse ? <><div className="signal"><span className="signal-icon green">↗</span><div><b>Top momentum</b><p>{pulse.topGainers[0] ? `${pulse.topGainers[0].symbol} naik ${pulse.topGainers[0].changePct.toFixed(2).replace('.', ',')}%` : 'Belum ada data gainer'}</p></div><span className="arrow">→</span></div><div className="signal"><span className="signal-icon yellow">!</span><div><b>Review losers</b><p>{pulse.topLosers.length ? `${pulse.topLosers.length} saham perlu ditinjau` : 'Belum ada data loser'}</p></div><span className="arrow">→</span></div></> : <div className="detail-hint">Menunggu data market…</div>}</section>
    </main>
  </div>;
}
function Metric({label, value, change, positive}: {label:string; value:string; change:string; positive?:boolean}) { return <article className="metric"><span>{label}</span><strong>{value}</strong><small className={positive ? 'gain' : ''}>{change}</small></article>; }
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
