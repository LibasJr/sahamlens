import { Bell, CalendarDays, ChartNoAxesCombined, Crosshair, LayoutDashboard, Radar, Settings2, Star, Wrench } from 'lucide-react';

export type Workspace = 'home' | 'market' | 'radar' | 'watchlist' | 'analysis' | 'tools' | 'calendar';

const items: Array<{ id: Workspace; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'home', label: 'Beranda', icon: LayoutDashboard },
  { id: 'market', label: 'Market', icon: ChartNoAxesCombined },
  { id: 'radar', label: 'Radar & Signal', icon: Radar },
  { id: 'watchlist', label: 'Watchlist', icon: Star },
  { id: 'analysis', label: 'Analisis Saham', icon: Crosshair },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'calendar', label: 'Kalender & News', icon: CalendarDays },
];

export function AppNavigation({ active, onChange }: { active: Workspace; onChange: (workspace: Workspace) => void }) {
  return <nav className="app-navigation" aria-label="Navigasi utama">
    <div className="nav-brand" aria-label="SahamLens">S</div>
    <div className="nav-items">{items.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'active' : ''} onClick={() => onChange(id)} title={label} aria-label={label}><Icon size={18} /><span>{label}</span></button>)}</div>
    <div className="nav-bottom"><button aria-label="Notifikasi" title="Notifikasi"><Bell size={18} /></button><button aria-label="Pengaturan" title="Pengaturan"><Settings2 size={18} /></button></div>
  </nav>;
}
