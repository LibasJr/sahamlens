import { BarChart3, BrainCircuit, ChartNoAxesCombined, Crosshair, LogOut, Settings, ShieldCheck, SlidersHorizontal, UserCircle } from 'lucide-react';

export type Workspace = 'market' | 'screener' | 'analysis' | 'intelligence' | 'research' | 'admin' | 'settings';

const mainItems: Array<{ id: Workspace; label: string; icon: typeof ChartNoAxesCombined }> = [
  { id: 'market', label: 'Pasar Hari Ini', icon: ChartNoAxesCombined },
  { id: 'screener', label: 'Screener', icon: SlidersHorizontal },
  { id: 'analysis', label: 'Analisis Emiten', icon: Crosshair },
  { id: 'intelligence', label: 'Market Intelligence', icon: BarChart3 },
  { id: 'research', label: 'Riset Emiten', icon: BrainCircuit },
];

export function AppNavigation({ active, onChange, isAdmin = false, authenticated = false, onProfile, onLogout }: {
  active: Workspace;
  onChange: (workspace: Workspace) => void;
  isAdmin?: boolean;
  authenticated?: boolean;
  onProfile: () => void;
  onLogout: () => void;
}) {
  const item = ({ id, label, icon: Icon }: typeof mainItems[number]) => <button key={id} className={active === id ? 'active' : ''} onClick={() => onChange(id)} title={label} aria-label={label}><Icon size={18} /><span>{label}</span></button>;
  return <nav className="app-navigation" aria-label="Navigasi utama">
    <div className="nav-brand" aria-label="SahamLens">S</div>
    <div className="nav-items">{mainItems.map(item)}</div>
    <div className="nav-bottom">
      {isAdmin && item({ id: 'admin', label: 'Admin Panel', icon: ShieldCheck })}
      {item({ id: 'settings', label: 'Pengaturan', icon: Settings })}
      <button onClick={onProfile} title={authenticated ? 'Profil akun' : 'Daftar / Masuk'} aria-label={authenticated ? 'Profil akun' : 'Daftar / Masuk'}><UserCircle size={18} /><span>{authenticated ? 'Profil' : 'Daftar / Masuk'}</span></button>
      {authenticated && <button onClick={onLogout} title="Keluar" aria-label="Keluar"><LogOut size={18} /><span>Keluar</span></button>}
    </div>
  </nav>;
}
