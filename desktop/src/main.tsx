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
import { LensAIDrawer } from './components/LensAIDrawer';
import { API_BASE_URL, addDesktopWatchlist, checkHealth, getAccount, getDesktopUpdate, getDesktopWatchlist, getResearchUniverse, logoutDesktop, removeDesktopWatchlist, type DesktopUpdate, type MarketPulse, type MarketSummary } from './api';
import './styles.css';
import './shell.css';
import './window.css';
import './design-system.css';
import './typography.css';
import './search.css';
import './account-modal.css';
import './access-gate.css';
import './resize.css';
import './stock-workspace.css';
import './tools-workspace.css';
import './operations.css';
import './calendar-workspace.css';
import './radar.css';
import './visual-polish.css';
import './v012.css';
import './v013.css';

export type Ticker = { symbol: string; name: string; price: number | null; change: number | null };
const analysisTabs = ['overview', 'technical', 'fundamental', 'dcf', 'earnings', 'ownership', 'backtest', 'compare'];
const toolTabs = ['compare', 'checklist', 'position-sizing', 'dividend', 'risk'];
const calendarTabs = ['calendar', 'news', 'macro'];
const researchTabs = ['analysis', 'consensus', 'bandarmology', 'tools'];

function featureFor(id: string) { const match = desktopFeatures.find((feature) => feature.id === id); if (!match) throw new Error(`Fitur desktop tidak terdaftar: ${id}`); return match; }
const explicitTabLabels: Record<string, string> = { overview: 'Overview', checklist: 'Checklist', 'position-sizing': 'Position Sizing', analysis: 'Analisis Emiten', consensus: 'Consensus Agent AI', bandarmology: 'Bandarmology', tools: 'Research Tools' };
function featureLabel(id: string) { return explicitTabLabels[id] ?? featureFor(id).label; }
function WorkspaceTitle({ kicker, title, description }: { kicker: string; title: string; description: string }) { return <div className="workspace-title"><div><span className="section-kicker">{kicker}</span><h1>{title}</h1><p>{description}</p></div></div>; }
function FeatureTabs({ ids, active, onChange }: { ids: string[]; active: string; onChange: (id: string) => void }) { return <nav className="workspace-tabs" aria-label="Tab workspace">{ids.map((id) => <button key={id} className={active === id ? 'active' : ''} onClick={() => onChange(id)}>{featureLabel(id)}</button>)}</nav>; }

function App() {
  const [selected, setSelected] = useState('');
  const [watchlist, setWatchlist] = useState<Ticker[]>([]);
  const [recommendations, setRecommendations] = useState<Ticker[]>([]);
  const [market, setMarket] = useState<{ summary: MarketSummary; pulse: MarketPulse } | null>(null);
  const [marketError, setMarketError] = useState('');
  const [workspace, setWorkspace] = useState<Workspace>('market');
  const [analysisTab, setAnalysisTab] = useState('fundamental');
  const [radarTab, setRadarTab] = useState('breakout');
  const [toolTab, setToolTab] = useState('dividend');
  const [calendarTab, setCalendarTab] = useState('calendar');
  const [researchTab, setResearchTab] = useState('analysis');
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [mode, setMode] = useState<ExperienceMode>(() => { const saved = window.localStorage.getItem('sahamlens.desktop.mode'); return saved === 'pro' ? 'expert' : saved === 'focus' || saved === 'expert' ? saved : 'guided'; });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => { const saved = window.localStorage.getItem('sahamlens.desktop.theme'); if (saved === 'light' || saved === 'dark') return saved; return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; });
  useEffect(() => { document.documentElement.classList.toggle('theme-dark', theme === 'dark'); document.documentElement.classList.toggle('theme-light', theme === 'light'); }, [theme]);
  const [watchlistCollapsed, setWatchlistCollapsed] = useState(false);
  const [insightCollapsed, setInsightCollapsed] = useState(false);
  const [watchlistWidth, setWatchlistWidth] = useState(260);
  const [insightWidth, setInsightWidth] = useState(310);
  const [watchlistSyncError, setWatchlistSyncError] = useState('');

  const [account, setAccount] = useState<DesktopAccount>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [lensAIOpen, setLensAIOpen] = useState(false);
  const [update, setUpdate] = useState<DesktopUpdate | null>(null);
  useEffect(() => { let active = true; void checkHealth(API_BASE_URL).then(status => { if (active) setApiStatus(status === 'connected' ? 'online' : 'offline'); }); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; void getDesktopUpdate(__APP_VERSION__).then((next) => { if (active) setUpdate(next); }).catch(() => undefined); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; void getResearchUniverse(API_BASE_URL).then((nextMarket) => { if (!active) return; const seen = new Set<string>(); const rows = [...nextMarket.summary.topGainers, ...nextMarket.summary.topLosers].filter((item) => !seen.has(item.symbol) && Boolean(seen.add(item.symbol))).slice(0, 12).map((item) => ({ symbol: item.symbol, name: item.symbol, price: item.price, change: item.changePct })); setMarket(nextMarket); setRecommendations(rows); setMarketError(''); }).catch(() => { if (active) setMarketError('Data pasar belum dapat dimuat. Periksa koneksi ke SahamLens.'); }); return () => { active = false; }; }, []);
  const syncWatchlist = () => { void getDesktopWatchlist().then((items) => { const rows = items.map((item) => ({ symbol: item.symbol, name: item.symbol, price: null, change: null })); setWatchlist(rows); setSelected((current) => current || rows[0]?.symbol || ''); setWatchlistSyncError(''); }).catch(() => { setWatchlist([]); setWatchlistSyncError('Daftar atau masuk untuk menyinkronkan Daftar Pantau.'); }); };
  const refreshAccount = () => { void getAccount().then((payload) => setAccount((payload as { user?: DesktopAccount }).user ?? null)).catch(() => setAccount(null)); };
  useEffect(() => { syncWatchlist(); refreshAccount(); const listener = () => { syncWatchlist(); refreshAccount(); }; window.addEventListener('desktop-auth-changed', listener); return () => window.removeEventListener('desktop-auth-changed', listener); }, []);
  const active = watchlist.find((stock) => stock.symbol === selected) ?? (selected ? { symbol: selected, name: selected, price: null, change: null } : undefined);
  const changeMode = (nextMode: ExperienceMode) => { setMode(nextMode); window.localStorage.setItem('sahamlens.desktop.mode', nextMode); };
  const toggleTheme = () => setTheme((current) => { const next = current === 'dark' ? 'light' : 'dark'; window.localStorage.setItem('sahamlens.desktop.theme', next); return next; });
  const openSymbol = (symbol: string) => { const normalized = symbol.trim().toUpperCase().replace('.JK', ''); if (!normalized) return; setSelected(normalized); setWorkspace('analysis'); };
  const selectFromMarket = (symbol: string) => { setSelected(symbol); setWorkspace('analysis'); };
  const featureWorkspace = (id: string) => <FeatureWorkspace feature={featureFor(id)} symbol={active?.symbol} authenticated={Boolean(account)} onRequestAuth={() => setAccountOpen(true)} />;
  const workspaceContent = () => {
    if (workspace === 'market') return <div className="workspace-page"><WorkspaceTitle kicker="PASAR HARI INI" title="Kondisi pasar dalam satu halaman" description="IHSG, breadth, sektor, movers, sentimen, dan ringkasan Daftar Pantau dari sumber SahamLens." />{mode === 'guided' && <ResearchGuide onNavigate={setWorkspace} />}<MarketOverview market={market} error={marketError} onSelect={selectFromMarket} /></div>;
    if (workspace === 'screener') return <div className="workspace-page"><WorkspaceTitle kicker="SCREENER" title="Saring kandidat riset" description="Screener SahamLens menggunakan data server aktual; hasil bukan rekomendasi transaksi." /><MarketScreener onSelect={selectFromMarket} /></div>;
    if (workspace === 'intelligence') return <div className="workspace-page"><WorkspaceTitle kicker="MARKET INTELLIGENCE" title="Baca konteks pasar" description="Gabungkan regime, breadth, sektor, movers, dan radar sebelum melanjutkan riset emiten." /><IntelligenceWorkspace market={market} error={marketError} onSelect={selectFromMarket} /></div>;

    if (workspace === 'analysis') return <div className="workspace-page research-workspace-page"><WorkspaceTitle kicker="RISET EMITEN" title={active?.symbol ?? 'Pilih emiten'} description="Ruang kerja riset: baca konteks, chart, data teknikal, fundamental, valuasi, earnings, ownership, dan backtest per-emiten." /><div className="research-workspace-body"><ChartPanel ticker={active} /><FeatureTabs ids={analysisTabs} active={analysisTab} onChange={setAnalysisTab} /><section className="research-detail-surface">{analysisTab === 'backtest' ? <BacktestWorkspace symbol={active?.symbol} /> : (['overview', 'fundamental', 'dcf', 'earnings', 'ownership'] as string[]).includes(analysisTab) ? <StockResearchWorkspace tab={analysisTab as 'overview' | 'fundamental' | 'dcf' | 'earnings' | 'ownership'} symbol={active?.symbol} /> : featureWorkspace(analysisTab)}</section></div></div>;
    if (workspace === 'research') return <div className="workspace-page"><WorkspaceTitle kicker="RISET EMITEN" title={active?.symbol ?? 'Pilih emiten'} description="Analisis emiten, Consensus Agent sebagai mode Lens AI, bandarmology sesuai data tersedia, dan tools unik." /><FeatureTabs ids={researchTabs} active={researchTab} onChange={setResearchTab} />{researchTab === 'analysis' ? <StockResearchWorkspace tab="overview" symbol={active?.symbol} /> : researchTab === 'consensus' ? <section className="feature-workspace"><h2>Consensus Agent AI</h2><p>Consensus Agent tersedia sebagai mode khusus Lens AI dan menggunakan data emiten aktif.</p><button className="primary-action" onClick={() => setLensAIOpen(true)}>Buka Consensus di Lens AI</button></section> : researchTab === 'bandarmology' ? featureWorkspace('ownership') : <><FeatureTabs ids={toolTabs} active={toolTab} onChange={setToolTab} />{toolTab === 'checklist' ? <StockChecklist symbol={active?.symbol} /> : toolTab === 'position-sizing' ? <PositionSizing /> : featureWorkspace(toolTab)}</>}</div>;
    if (workspace === 'admin') return <div className="workspace-page"><WorkspaceTitle kicker="ADMIN CONSOLE" title="Operasional platform" description="Status sistem dan sumber data khusus administrator SahamLens." /><AdminConsole /></div>;
    if (workspace === 'settings') return <div className="workspace-page"><WorkspaceTitle kicker="PENGATURAN" title="Akun & aplikasi" description="Kelola sesi akun, tema, dan pembaruan SahamLens Desktop dari satu tempat." /><section className="feature-workspace"><div className="feature-heading"><div><span className="section-kicker">AKUN SAHAMLENS</span><h2>{account?.email ?? 'Belum masuk'}</h2><p>{account ? `Role ${account.role ?? 'user'}${account.is_pro ? ' · Pro aktif' : ''}` : 'Masuk untuk menyinkronkan watchlist dan memakai fitur akun.'}</p></div></div><button className="primary-action" onClick={() => setAccountOpen(true)}>{account ? 'Kelola akun / keluar' : 'Masuk ke akun'}</button><div className="feature-json">Versi aplikasi: SahamLens Desktop v{__APP_VERSION__}{'\n'}{update?.available ? `Pembaruan v${update.version} tersedia.${update.notes ? ` ${update.notes}` : ''}` : 'Pembaruan diperiksa otomatis saat aplikasi dibuka.'}{update?.available && update.downloadUrl ? <><br /><a href={update.downloadUrl} target="_blank" rel="noreferrer">Unduh pembaruan terverifikasi</a></> : null}</div></section></div>;
    return <div className="workspace-page"><WorkspaceTitle kicker="INFORMASI PASAR" title="Kalender & News" description="Aksi korporasi, berita, dan konteks makro dari sumber SahamLens." /><FeatureTabs ids={calendarTabs} active={calendarTab} onChange={setCalendarTab} />{calendarTab === 'calendar' ? <CalendarWorkspace /> : featureWorkspace(calendarTab)}</div>;
  };
  const resizeWatchlist = (delta: number) => setWatchlistWidth((width) => Math.max(220, Math.min(380, width + delta)));
  const resizeInsight = (delta: number) => setInsightWidth((width) => Math.max(280, Math.min(460, width + delta)));
  const layoutStyle = { '--watchlist-width': `${watchlistWidth}px`, '--insight-width': `${insightWidth}px` } as CSSProperties;
  return <div style={layoutStyle} data-theme={theme} className={`desktop-app mode-${mode}${watchlistCollapsed ? ' watchlist-collapsed' : ''}${insightCollapsed ? ' insight-collapsed' : ''}`}>
    <TitleBar apiStatus={apiStatus} />
    <AppNavigation active={workspace} onChange={setWorkspace} isAdmin={account?.role === 'admin'} authenticated={Boolean(account)} onProfile={() => setAccountOpen(true)} onLogout={() => void logoutDesktop().then(() => { setAccount(null); setWatchlist([]); window.dispatchEvent(new Event('desktop-auth-changed')); })} />
    <GlobalHeader apiStatus={apiStatus} mode={mode} onModeChange={changeMode} theme={theme} onToggleTheme={toggleTheme} onSearch={openSymbol} onToggleWatchlist={() => setWatchlistCollapsed((value) => !value)} onToggleInsight={() => setInsightCollapsed((value) => !value)} accountEmail={account?.email} onOpenAccount={() => setAccountOpen(true)} onOpenLensAI={() => setLensAIOpen(true)} />
    <Watchlist stocks={watchlist} recommendations={recommendations} selected={selected} authenticated={Boolean(account)} onSelect={(symbol) => { setSelected(symbol); setWorkspace('analysis'); }} syncError={watchlistSyncError} onAddSymbol={async (symbol, name) => { if (watchlist.some((item) => item.symbol === symbol)) return; try { await addDesktopWatchlist(symbol); setWatchlist((current) => [...current, { symbol, name: name ?? symbol, price: null, change: null }]); setWatchlistSyncError(''); } catch (reason) { setWatchlistSyncError(reason instanceof Error ? reason.message : 'Daftar Pantau tidak dapat disinkronkan.'); throw reason; } }} onRemoveSymbol={async (symbol) => { await removeDesktopWatchlist(symbol); setWatchlist((current) => current.filter((item) => item.symbol !== symbol)); }} />
    <PanelResizeHandle side="left" onResize={resizeWatchlist} />
    <main className="workspace-main">{workspaceContent()}</main>
    <ResearchPanel ticker={active} apiBaseUrl={API_BASE_URL} apiStatus={apiStatus} />
    <PanelResizeHandle side="right" onResize={resizeInsight} />
    <AccountModal open={accountOpen} account={account} onClose={() => setAccountOpen(false)} />
    <LensAIDrawer open={lensAIOpen} symbol={active?.symbol} workspace={workspace} onClose={() => setLensAIOpen(false)} />
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
