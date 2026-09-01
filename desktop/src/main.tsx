import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppNavigation, type Workspace } from './components/AppNavigation';
import { ChartPanel } from './components/ChartPanel';
import { FeatureWorkspace, desktopFeatures } from './components/FeatureWorkspace';
import { GlobalHeader } from './components/GlobalHeader';
import { MarketOverview } from './components/MarketOverview';
import { MarketScreener } from './components/MarketScreener';
import { ResearchPanel } from './components/ResearchPanel';
import { TitleBar } from './components/TitleBar';
import { Watchlist } from './components/Watchlist';
import { API_BASE_URL, checkHealth, getResearchUniverse, type MarketPulse, type MarketSummary } from './api';
import './styles.css';
import './shell.css';
import './window.css';

export type Ticker = { symbol: string; name: string; price: number | null; change: number | null };
const analysisTabs = ['technical', 'fundamental', 'dcf', 'earnings', 'ownership', 'compare'];
const toolTabs = ['dividend', 'backtest', 'risk'];
const calendarTabs = ['calendar', 'news', 'macro'];

function featureFor(id: string) { return desktopFeatures.find((feature) => feature.id === id) ?? desktopFeatures[0]; }
function WorkspaceTitle({ kicker, title, description }: { kicker: string; title: string; description: string }) { return <div className="workspace-title"><div><span className="section-kicker">{kicker}</span><h1>{title}</h1><p>{description}</p></div></div>; }
function FeatureTabs({ ids, active, onChange }: { ids: string[]; active: string; onChange: (id: string) => void }) { return <nav className="workspace-tabs" aria-label="Tab workspace">{ids.map((id) => <button key={id} className={active === id ? 'active' : ''} onClick={() => onChange(id)}>{featureFor(id).label}</button>)}</nav>; }

function App() {
  const [selected, setSelected] = useState('');
  const [watchlist, setWatchlist] = useState<Ticker[]>([]);
  const [market, setMarket] = useState<{ summary: MarketSummary; pulse: MarketPulse } | null>(null);
  const [marketError, setMarketError] = useState('');
  const [workspace, setWorkspace] = useState<Workspace>('home');
  const [analysisTab, setAnalysisTab] = useState('fundamental');
  const [radarTab, setRadarTab] = useState('breakout');
  const [toolTab, setToolTab] = useState('dividend');
  const [calendarTab, setCalendarTab] = useState('calendar');
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [watchlistCollapsed, setWatchlistCollapsed] = useState(false);
  const [insightCollapsed, setInsightCollapsed] = useState(false);
  useEffect(() => { let active = true; void checkHealth(API_BASE_URL).then(status => { if (active) setApiStatus(status === 'connected' ? 'online' : 'offline'); }); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; void getResearchUniverse(API_BASE_URL).then((nextMarket) => { if (!active) return; const seen = new Set<string>(); const rows = [...nextMarket.summary.topGainers, ...nextMarket.summary.topLosers].filter((item) => !seen.has(item.symbol) && Boolean(seen.add(item.symbol))).slice(0, 12).map((item) => ({ symbol: item.symbol, name: item.symbol, price: item.price, change: item.changePct })); setMarket(nextMarket); setWatchlist(rows); setSelected((current) => current || rows[0]?.symbol || ''); setMarketError(''); }).catch(() => { if (active) setMarketError('Data pasar belum dapat dimuat. Periksa koneksi ke SahamLens.'); }); return () => { active = false; }; }, []);
  const active = watchlist.find((stock) => stock.symbol === selected) ?? (selected ? { symbol: selected, name: selected, price: null, change: null } : undefined);
  const openSymbol = (symbol: string) => { const normalized = symbol.trim().toUpperCase().replace('.JK', ''); if (!normalized) return; if (!watchlist.some((stock) => stock.symbol === normalized)) setWatchlist((current) => [...current, { symbol: normalized, name: normalized, price: null, change: null }]); setSelected(normalized); setWorkspace('analysis'); };
  const selectFromMarket = (symbol: string) => { setSelected(symbol); setWorkspace('analysis'); };
  const workspaceContent = () => {
    if (workspace === 'home') return <div className="workspace-page"><WorkspaceTitle kicker="SAHAMLENS DESKTOP" title="Market Overview" description="Kondisi pasar, breadth, dan pergerakan saham dari API SahamLens." /><MarketOverview market={market} error={marketError} onSelect={selectFromMarket} /><MarketScreener onSelect={selectFromMarket} /></div>;
    if (workspace === 'market') return <div className="workspace-page"><WorkspaceTitle kicker="MARKET INTELLIGENCE" title="Market & Breadth" description="Pantau indeks, market movers, dan kandidat dari data pasar terkini." /><MarketOverview market={market} error={marketError} onSelect={selectFromMarket} /><MarketScreener onSelect={selectFromMarket} /></div>;
    if (workspace === 'radar') return <div className="workspace-page"><WorkspaceTitle kicker="RADAR & SIGNAL" title="Peluang terpantau" description="Signal server ditampilkan apa adanya; bukan rekomendasi transaksi otomatis." /><FeatureTabs ids={['breakout', 'recommendations']} active={radarTab} onChange={setRadarTab} /><FeatureWorkspace feature={featureFor(radarTab)} symbol={active?.symbol} /></div>;
    if (workspace === 'watchlist') return <div className="workspace-page"><WorkspaceTitle kicker="WATCHLIST" title="Daftar pantau" description="Pilih saham dari panel kiri untuk membuka chart dan analisis resminya." /><ChartPanel ticker={active} /></div>;
    if (workspace === 'analysis') return <div className="workspace-page"><WorkspaceTitle kicker="STOCK WORKSPACE" title={active?.symbol ?? 'Pilih emiten'} description="Analisis teknikal, fundamental, valuasi, earnings, dan kepemilikan dalam satu ruang kerja." /><ChartPanel ticker={active} /><FeatureTabs ids={analysisTabs} active={analysisTab} onChange={setAnalysisTab} /><FeatureWorkspace feature={featureFor(analysisTab)} symbol={active?.symbol} /></div>;
    if (workspace === 'tools') return <div className="workspace-page"><WorkspaceTitle kicker="RESEARCH TOOLS" title="Tools analisis" description="Gunakan kalkulasi dan simulasi yang diproses oleh SahamLens." /><FeatureTabs ids={toolTabs} active={toolTab} onChange={setToolTab} /><FeatureWorkspace feature={featureFor(toolTab)} symbol={active?.symbol} /></div>;
    return <div className="workspace-page"><WorkspaceTitle kicker="INFORMASI PASAR" title="Kalender & News" description="Aksi korporasi, berita, dan konteks makro dari sumber SahamLens." /><FeatureTabs ids={calendarTabs} active={calendarTab} onChange={setCalendarTab} /><FeatureWorkspace feature={featureFor(calendarTab)} symbol={active?.symbol} /></div>;
  };
  return <div className={`desktop-app${watchlistCollapsed ? ' watchlist-collapsed' : ''}${insightCollapsed ? ' insight-collapsed' : ''}`}>
    <TitleBar apiStatus={apiStatus} />
    <AppNavigation active={workspace} onChange={setWorkspace} />
    <GlobalHeader apiStatus={apiStatus} onSearch={openSymbol} onToggleWatchlist={() => setWatchlistCollapsed((value) => !value)} onToggleInsight={() => setInsightCollapsed((value) => !value)} />
    <Watchlist stocks={watchlist} selected={selected} onSelect={(symbol) => { setSelected(symbol); setWorkspace('analysis'); }} onChange={setWatchlist} />
    <main className="workspace-main">{workspaceContent()}</main>
    <ResearchPanel ticker={active} apiBaseUrl={API_BASE_URL} apiStatus={apiStatus} />
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
