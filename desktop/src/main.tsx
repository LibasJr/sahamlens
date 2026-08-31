import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChartPanel } from './components/ChartPanel';
import { MarketScreener } from './components/MarketScreener';
import { OrderPanel } from './components/OrderPanel';
import { TitleBar } from './components/TitleBar';
import { Watchlist } from './components/Watchlist';
import { API_BASE_URL, checkHealth, getWatchlist } from './api';
import { getToken, saveWatchlist } from './tokenStore';
import { desktopFeatures, FeatureWorkspace } from './components/FeatureWorkspace';
import './styles.css';

export type Ticker = { symbol: string; name: string; price: number | null; change: number | null };

function App() {
  const [selected, setSelected] = useState('');
  const [watchlist, setWatchlist] = useState<Ticker[]>([]);
  const [featureId, setFeatureId] = useState('overview');
  const [authVersion, setAuthVersion] = useState(0);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  useEffect(() => { let active = true; void checkHealth(API_BASE_URL).then(status => { if (active) setApiStatus(status === 'connected' ? 'online' : 'offline'); }); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; void getToken().then((token) => getWatchlist(API_BASE_URL, token ?? undefined)).then((remote) => { if (!active) return; const next = remote.map((item) => ({ symbol: item.symbol, name: item.name ?? item.symbol, price: item.price ?? null, change: item.changePct ?? null })); setWatchlist(next); setSelected((current) => current || next[0]?.symbol || ''); void saveWatchlist(next); }).catch(() => { if (active) setWatchlist([]); }); return () => { active = false; }; }, [authVersion]);
  const active = watchlist.find((stock) => stock.symbol === selected) ?? watchlist[0];

  return (
    <div className="desktop-shell">
      <div className="terminal-window">
        <TitleBar apiStatus={apiStatus} />
        <div className="terminal-body">
          <Watchlist stocks={watchlist} selected={selected} onSelect={setSelected} onChange={setWatchlist} onAuthenticated={() => setAuthVersion(v => v + 1)} />
          <main className="workspace-main">
            <div className="feature-nav"><button className={featureId === 'overview' ? 'active' : ''} onClick={() => setFeatureId('overview')}>Overview</button>{desktopFeatures.map((feature) => <button key={feature.id} className={featureId === feature.id ? 'active' : ''} onClick={() => setFeatureId(feature.id)}>{feature.label}</button>)}</div>
            <ChartPanel ticker={active} />
            {featureId === 'overview' ? <MarketScreener onSelect={setSelected} /> : <FeatureWorkspace feature={desktopFeatures.find((feature) => feature.id === featureId) ?? desktopFeatures[0]} symbol={active?.symbol} />}
          </main>
          <OrderPanel ticker={active} apiBaseUrl={API_BASE_URL} />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
