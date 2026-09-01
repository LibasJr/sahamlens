import { StrictMode, useEffect, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { AppNavigation, type Workspace } from './components/AppNavigation';
import { AccountModal, type DesktopAccount } from './components/AccountModal';
import { CalendarWorkspace } from './components/CalendarWorkspace';
import { ChartPanel } from './components/ChartPanel';
import { FeatureWorkspace, desktopFeatures } from './components/FeatureWorkspace';
import { GlobalHeader, type ExperienceMode } from './components/GlobalHeader';
import { MarketOverview } from './components/MarketOverview';
import { MarketScreener } from './components/MarketScreener';
import { ResearchPanel } from './components/ResearchPanel';
import { ResearchGuide } from './components/ResearchGuide';
import { PanelResizeHandle } from './components/PanelResizeHandle';
import { StockResearchWorkspace } from './components/StockResearchWorkspace';
import { PositionSizing, StockChecklist } from './components/ToolsWorkspace';
import { BacktestWorkspace } from './components/BacktestWorkspace';
import { RadarWorkspace } from './components/RadarWorkspace';
import { AdminConsole, IntelligenceWorkspace } from './components/OperationsWorkspace';
import { TitleBar } from './components/TitleBar';
import { Watchlist } from './components/Watchlist';
import { API_BASE_URL, addDesktopWatchlist, checkHealth, getAccount, getDesktopWatchlist, getResearchUniverse, type MarketPulse, type MarketSummary } from './api';
import './styles.css';
import './shell.css';
import './window.css';
import './design-system.css';
import './typography.css';
import './search.css';
import './account-modal.css';
import './resize.css';
import './stock-workspace.css';
import './tools-workspace.css';
import './operations.css';
import './calendar-workspace.css';
import './radar.css';
import './ai-insights.css';

export type Ticker = { symbol: string; name: string; price: number | null; change: number | null };
const analysisTabs = ['overview', 'technical', 'fundamental', 'dcf', 'earnings', 'ownership', 'compare'];
const toolTabs = ['compare', 'checklist', 'position-sizing', 'earnings', 'dividend', 'backtest', 'risk'];
const calendarTabs = ['calendar', 'news', 'macro'];

function featureFor(id: string) { return desktopFeatures.find((feature) => feature.id === id) ?? desktopFeatures[0]; }
function featureLabel(id: string) { if (id === 'overview') return 'Overview'; if (id === 'checklist') return 'Checklist'; if (id === 'position-sizing') return 'Position Sizing'; return featureFor(id).label; }
function WorkspaceTitle({ kicker, title, description }: { kicker: string; title: string; description: string }) { return <div className="workspace-title"><div><span className="section-kicker">{kicker}</span><h1>{title}</h1><p>{description}</p></div></div>; }
function FeatureTabs({ ids, active, onChange }: { ids: string[]; active: string; onChange: (id: string) => void }) { return <nav className="workspace-tabs" aria-label="Tab workspace">{ids.map((id) => <button key={id} className={active === id ? 'active' : ''} onClick={() => onChange(id)}>{featureLabel(id)}</button>)}</nav>; }

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
  const [mode, setMode] = useState<ExperienceMode>(() => (window.localStorage.getItem('sahamlens.desktop.mode') as ExperienceMode) || 'guided');
  const [watchlistCollapsed, setWatchlistCollapsed] = useState(false);
  const [insightCollapsed, setInsightCollapsed] = useState(false);
  const [watchlistWidth, setWatchlistWidth] = useState(260);
  const [insightWidth, setInsightWidth] = useState(310);
  const [watchlistSyncError, setWatchlistSyncError] = useState('');
  const [savedSymbols, setSavedSymbols] = useState<string[]>([]);
  const [account, setAccount] = useState<DesktopAccount>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => { let active = true; void checkHealth(API_BASE_URL).then(status => { if (active) setApiStatus(status === 'connected' ? 'online' : 'offline'); }); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; void getResearchUniverse(API_BASE_URL).then((nextMarket) => { if (!active) return; const seen = new Set<string>(); const rows = [...nextMarket.summary.topGainers, ...nextMarket.summary.topLosers].filter((item) => !seen.has(item.symbol) && Boolean(seen.add(item.symbol))).slice(0, 12).map((item) => ({ symbol: item.symbol, name: item.symbol, price: item.price, change: item.changePct })); setMarket(nextMarket); setWatchlist(rows); setSelected((current) => current || rows[0]?.symbol || ''); setMarketError(''); }).catch(() => { if (active) setMarketError('Data pasar belum dapat dimuat. Periksa koneksi ke SahamLens.'); }); return () => { active = false; }; }, []);
  const syncWatchlist = () => { void getDesktopWatchlist().then((items) => { setSavedSymbols(items.map((item) => item.symbol)); setWatchlist((current) => { const existing = new Set(current.map((item) => item.symbol)); return [...current, ...items.filter((item) => !existing.has(item.symbol)).map((item) => ({ symbol: item.symbol, name: item.symbol, price: null, change: null }))]; }); setWatchlistSyncError(''); }).catch(() => { setSavedSymbols([]); setWatchlistSyncError('Masuk untuk sinkronisasi Watchlist.'); }); };
  const refreshAccount = () => { void getAccount().then((payload) => setAccount((payload as { user?: DesktopAccount }).user ?? null)).catch(() => setAccount(null)); };
  useEffect(() => { syncWatchlist(); refreshAccount(); const listener = () => { syncWatchlist(); refreshAccount(); }; window.addEventListener('desktop-auth-changed', listener); return () => window.removeEventListener('desktop-auth-changed', listener); }, []);
  const active = watchlist.find((stock) => stock.symbol === selected) ?? (selected ? { symbol: selected, name: selected, price: null, change: null } : undefined);
  const changeMode = (nextMode: ExperienceMode) => { setMode(nextMode); window.localStorage.setItem('sahamlens.desktop.mode', nextMode); };
  const openSymbol = (symbol: string, name?: string) => { const normalized = symbol.trim().toUpperCase().replace('.JK', ''); if (!normalized) return; setWatchlist((current) => { const existing = current.find((stock) => stock.symbol === normalized); return existing ? current.map((stock) => stock.symbol === normalized ? { ...stock, name: name || stock.name } : stock) : [...current, { symbol: normalized, name: name || normalized, price: null, change: null }]; }); setSelected(normalized); setWorkspace('analysis'); };
  const selectFromMarket = (symbol: string) => { setSelected(symbol); setWorkspace('analysis'); };
  const workspaceContent = () => {
    if (workspace === 'home') return <div className="workspace-page"><WorkspaceTitle kicker="SAHAMLENS DESKTOP" title={mode === 'guided' ? 'Mulai dari konteks pasar' : 'Market Overview'} description={mode === 'guided' ? 'Ikuti alur riset sederhana sebelum menilai sebuah saham.' : 'Kondisi pasar, breadth, dan pergerakan saham dari API SahamLens.'} />{mode === 'guided' && <ResearchGuide onNavigate={setWorkspace} />}<MarketOverview market={market} error={marketError} onSelect={selectFromMarket} /><MarketScreener onSelect={selectFromMarket} /></div>;
    if (workspace === 'market') return <div className="workspace-page"><WorkspaceTitle kicker="MARKET INTELLIGENCE" title="Market & Breadth" description="Pantau indeks, market movers, dan kandidat dari data pasar terkini." /><MarketOverview market={market} error={marketError} onSelect={selectFromMarket} /><MarketScreener onSelect={selectFromMarket} /></div>;
    if (workspace === 'intelligence') return <div className="workspace-page"><WorkspaceTitle kicker="MARKET INTELLIGENCE" title="Baca konteks pasar" description="Gabungkan regime, breadth, sektor, movers, dan radar sebelum melanjutkan riset emiten." /><IntelligenceWorkspace market={market} error={marketError} onSelect={selectFromMarket} /></div>;
    if (workspace === 'radar') return <div className="workspace-page"><WorkspaceTitle kicker="RADAR & SIGNAL" title="Peluang terpantau" description="Signal server ditampilkan apa adanya; bukan rekomendasi transaksi otomatis." /><FeatureTabs ids={['breakout', 'recommendations']} active={radarTab} onChange={setRadarTab} />{radarTab === 'breakout' ? <RadarWorkspace onSelect={selectFromMarket} /> : <FeatureWorkspace feature={featureFor(radarTab)} symbol={active?.symbol} />}</div>;
    if (workspace === 'watchlist') return <div className="workspace-page"><WorkspaceTitle kicker="WATCHLIST" title="Daftar pantau" description="Pilih saham dari panel kiri untuk membuka chart dan analisis resminya." /><ChartPanel ticker={active} /></div>;
    if (workspace === 'analysis') return <div className="workspace-page research-workspace-page"><WorkspaceTitle kicker="RISET EMITEN" title={active?.symbol ?? 'Pilih emiten'} description="Ruang kerja riset: baca konteks, chart, data teknikal, fundamental, valuasi, earnings, dan ownership secara mendalam." /><div className="research-workspace-body"><ChartPanel ticker={active} /><FeatureTabs ids={analysisTabs} active={analysisTab} onChange={setAnalysisTab} /><section className="research-detail-surface">{(['overview', 'fundamental', 'dcf', 'earnings', 'ownership'] as string[]).includes(analysisTab) ? <StockResearchWorkspace tab={analysisTab as 'overview' | 'fundamental' | 'dcf' | 'earnings' | 'ownership'} symbol={active?.symbol} /> : <FeatureWorkspace feature={featureFor(analysisTab)} symbol={active?.symbol} />}</section></div></div>;
    if (workspace === 'tools') return <div className="workspace-page"><WorkspaceTitle kicker="RESEARCH TOOLS" title="Tools analisis" description="Bandingkan emiten, cek kelengkapan data, dan gunakan kalkulasi risiko secara transparan." /><FeatureTabs ids={toolTabs} active={toolTab} onChange={setToolTab} />{toolTab === 'checklist' ? <StockChecklist symbol={active?.symbol} /> : toolTab === 'position-sizing' ? <PositionSizing /> : toolTab === 'earnings' ? <StockResearchWorkspace tab="earnings" symbol={active?.symbol} /> : toolTab === 'backtest' ? <BacktestWorkspace /> : <FeatureWorkspace feature={featureFor(toolTab)} symbol={active?.symbol} />}</div>;
    if (workspace === 'admin') return <div className="workspace-page"><WorkspaceTitle kicker="ADMIN CONSOLE" title="Operasional platform" description="Status sistem dan sumber data khusus administrator SahamLens." /><AdminConsole /></div>;
    return <div className="workspace-page"><WorkspaceTitle kicker="INFORMASI PASAR" title="Kalender & News" description="Aksi korporasi, berita, dan konteks makro dari sumber SahamLens." /><FeatureTabs ids={calendarTabs} active={calendarTab} onChange={setCalendarTab} />{calendarTab === 'calendar' ? <CalendarWorkspace /> : <FeatureWorkspace feature={featureFor(calendarTab)} symbol={active?.symbol} />}</div>;
  };
  const resizeWatchlist = (delta: number) => setWatchlistWidth((width) => Math.max(220, Math.min(380, width + delta)));
  const resizeInsight = (delta: number) => setInsightWidth((width) => Math.max(280, Math.min(460, width + delta)));
  const layoutStyle = { '--watchlist-width': `${watchlistWidth}px`, '--insight-width': `${insightWidth}px` } as CSSProperties;
  return <div style={layoutStyle} className={`desktop-app mode-${mode}${watchlistCollapsed ? ' watchlist-collapsed' : ''}${insightCollapsed ? ' insight-collapsed' : ''}`}>
    <TitleBar apiStatus={apiStatus} />
    <AppNavigation active={workspace} onChange={setWorkspace} isAdmin={account?.role === 'admin'} />
    <GlobalHeader apiStatus={apiStatus} mode={mode} onModeChange={changeMode} onSearch={openSymbol} onToggleWatchlist={() => setWatchlistCollapsed((value) => !value)} onToggleInsight={() => setInsightCollapsed((value) => !value)} accountEmail={account?.email} onOpenAccount={() => setAccountOpen(true)} />
    <Watchlist stocks={watchlist} selected={selected} onSelect={(symbol) => { setSelected(symbol); setWorkspace('analysis'); }} onChange={setWatchlist} savedSymbols={savedSymbols} syncError={watchlistSyncError} onAddSymbol={async (symbol) => { try { await addDesktopWatchlist(symbol); setSavedSymbols((current) => current.includes(symbol) ? current : [...current, symbol]); setWatchlistSyncError(''); } catch (reason) { const message = reason instanceof Error ? reason.message : 'Watchlist tidak dapat disinkronkan.'; setWatchlistSyncError(message); throw reason; } }} />
    <PanelResizeHandle side="left" onResize={resizeWatchlist} />
    <main className="workspace-main">{workspaceContent()}</main>
    <ResearchPanel ticker={active} apiBaseUrl={API_BASE_URL} apiStatus={apiStatus} />
    <PanelResizeHandle side="right" onResize={resizeInsight} />
    <AccountModal open={accountOpen} account={account} onClose={() => setAccountOpen(false)} />
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
