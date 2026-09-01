import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChartPanel } from './components/ChartPanel';
import { MarketScreener } from './components/MarketScreener';
import { ResearchPanel } from './components/ResearchPanel';
import { TitleBar } from './components/TitleBar';
import { Watchlist } from './components/Watchlist';
import { API_BASE_URL, checkHealth, getResearchUniverse, type MarketPulse, type MarketSummary } from './api';
import { desktopFeatures, FeatureWorkspace } from './components/FeatureWorkspace';
import { MarketOverview } from './components/MarketOverview';
import './styles.css';

export type Ticker = { symbol: string; name: string; price: number | null; change: number | null };
const featureGroups = [
  { label: 'Pasar', ids: ['market-pulse', 'market-summary', 'screener', 'news', 'calendar', 'macro'] },
  { label: 'Emiten', ids: ['technical', 'fundamental', 'compare', 'dcf', 'earnings', 'ownership'] },
  { label: 'Riset', ids: ['breakout', 'recommendations', 'ai', 'risk', 'backtest', 'dividend'] },
  { label: 'Akun', ids: ['watchlist', 'portfolio'] },
];

function App() {
  const [selected, setSelected] = useState('');
  const [watchlist, setWatchlist] = useState<Ticker[]>([]);
  const [market, setMarket] = useState<{ summary: MarketSummary; pulse: MarketPulse } | null>(null);
  const [marketError, setMarketError] = useState('');
  const [featureId, setFeatureId] = useState('overview');
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  useEffect(() => { let active = true; void checkHealth(API_BASE_URL).then(status => { if (active) setApiStatus(status === 'connected' ? 'online' : 'offline'); }); return () => { active = false; }; }, []);
  useEffect(() => {
    let active = true;
    void getResearchUniverse(API_BASE_URL).then((nextMarket) => {
      if (!active) return;
      const seen = new Set<string>();
      const rows = [...nextMarket.summary.topGainers, ...nextMarket.summary.topLosers]
        .filter((item) => !seen.has(item.symbol) && Boolean(seen.add(item.symbol)))
        .slice(0, 12)
        .map((item) => ({ symbol: item.symbol, name: item.symbol, price: item.price, change: item.changePct }));
      setMarket(nextMarket); setWatchlist(rows); setSelected((current) => current || rows[0]?.symbol || ''); setMarketError('');
    }).catch(() => { if (active) setMarketError('Data pasar belum dapat dimuat. Periksa koneksi ke SahamLens.'); });
    return () => { active = false; };
  }, []);
  const active = watchlist.find((stock) => stock.symbol === selected) ?? (selected ? { symbol: selected, name: selected, price: null, change: null } : watchlist[0]);

  return (
    <div className="desktop-shell">
      <div className="terminal-window">
        <TitleBar apiStatus={apiStatus} />
        <div className="terminal-body">
          <Watchlist stocks={watchlist} selected={selected} onSelect={setSelected} onChange={setWatchlist} />
          <main className="workspace-main">
            <nav className="feature-nav" aria-label="Fitur analisis"><button className={featureId === 'overview' ? 'active' : ''} onClick={() => setFeatureId('overview')}>Ringkasan</button>{featureGroups.map((group) => <div className="feature-nav-group" key={group.label}><span>{group.label}</span>{desktopFeatures.filter((feature) => group.ids.includes(feature.id)).map((feature) => <button key={feature.id} className={featureId === feature.id ? 'active' : ''} onClick={() => setFeatureId(feature.id)}>{feature.label}</button>)}</div>)}</nav>
            {featureId === 'overview' ? <><MarketOverview market={market} error={marketError} onSelect={setSelected} /><ChartPanel ticker={active} /><MarketScreener onSelect={setSelected} /></> : <FeatureWorkspace feature={desktopFeatures.find((feature) => feature.id === featureId) ?? desktopFeatures[0]} symbol={active?.symbol} />}
          </main>
          <ResearchPanel ticker={active} apiBaseUrl={API_BASE_URL} apiStatus={apiStatus} />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
