import { Minus, Square, X, Activity } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function TitleBar({ apiStatus = 'checking' }: { apiStatus?: 'checking' | 'online' | 'offline' }) {
  const window = getCurrentWindow();
  return <header className="titlebar" data-tauri-drag-region>
    <div className="titlebar-brand"><span className="brand-glyph"><Activity size={15} /></span><span>SahamLens</span><span className="titlebar-divider" /><span className="titlebar-context">TRADING TERMINAL</span><span>API {apiStatus === 'checking' ? 'CHECKING' : apiStatus === 'online' ? '200 OK' : 'OFFLINE'}</span></div>
    <div className="window-actions" data-tauri-drag-region="false">
      <button aria-label="Minimize" onClick={() => window.minimize()}><Minus size={15} /></button>
      <button aria-label="Maximize" onClick={() => window.toggleMaximize()}><Square size={13} /></button>
      <button className="window-close" aria-label="Close" onClick={() => window.close()}><X size={15} /></button>
    </div>
  </header>;
}
