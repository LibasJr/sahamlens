import { CalendarDays, ChartNoAxesCombined, Crosshair, LayoutDashboard, Radar, Settings, ShieldCheck, Sparkles, Star, Wrench } from 'lucide-react';

export type Workspace = 'home' | 'market' | 'intelligence' | 'radar' | 'watchlist' | 'analysis' | 'tools' | 'calendar' | 'admin' | 'settings';

const items: Array<{ id: Workspace; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'home', label: 'Beranda', icon: LayoutDashboard },
  { id: 'market', label: 'Market', icon: ChartNoAxesCombined },
  { id: 'intelligence', label: 'Intelligence', icon: Sparkles },
  { id: 'radar', label: 'Radar & Signal', icon: Radar },
  { id: 'watchlist', label: 'Watchlist', icon: Star },
  { id: 'analysis', label: 'Analisis Saham', icon: Crosshair },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'calendar', label: 'Kalender & News', icon: CalendarDays },
  { id: 'settings', label: 'Pengaturan Akun', icon: Settings },
];

export function AppNavigation({ active, onChange, isAdmin = false }: { active: Workspace; onChange: (workspace: Workspace) => void; isAdmin?: boolean }) {
  return <nav className="app-navigation" aria-label="Navigasi utama">
    <div className="nav-brand" aria-label="SahamLens">S</div>
    <div className="nav-items">{items.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'active' : ''} onClick={() => onChange(id)} title={label} aria-label={label}><Icon size={18} /><span>{label}</span></button>)}</div>
    {isAdmin && <button className={`admin-nav-button ${active === 'admin' ? 'active' : ''}`} onClick={() => onChange('admin')} title="Admin Console" aria-label="Admin Console"><ShieldCheck size={18} /></button>}
  </nav>;
}
