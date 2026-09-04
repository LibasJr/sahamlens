import React, { useState } from 'react';
import { Minus, Square, Copy, X, Search, Sparkles, User, ShieldCheck } from 'lucide-react';
import { type MarketPulse, type UserSession } from '../api';

interface TitleBarProps {
  marketPulse: MarketPulse | null;
  onOpenSearch: () => void;
  onToggleAI: () => void;
  isAiOpen: boolean;
  userSession: UserSession;
  onOpenLogin: () => void;
  onLogout: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  marketPulse,
  onOpenSearch,
  onToggleAI,
  isAiOpen,
  userSession,
  onOpenLogin,
  onLogout,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  const getTauriWindow = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      return getCurrentWindow();
    } catch {
      return null;
    }
  };

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const win = await getTauriWindow();
      if (win) await win.minimize();
    } catch (err) {
      console.warn('Minimize error:', err);
    }
  };

  const handleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const win = await getTauriWindow();
      if (win) {
        await win.toggleMaximize();
        const max = await win.isMaximized();
        setIsMaximized(max);
      }
    } catch (err) {
      console.warn('Maximize error:', err);
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const win = await getTauriWindow();
      if (win) await win.close();
    } catch (err) {
      console.warn('Close error:', err);
    }
  };

  const ihsg = marketPulse?.ihsg;

  return (
    <header
      data-tauri-drag-region
      className="h-10 bg-pro-bg border-b border-pro-border flex items-center justify-between px-3 select-none z-50 text-xs font-medium"
    >
      {/* Brand & Market Ticker Strip */}
      <div className="flex items-center gap-3" data-tauri-drag-region>
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <div className="w-5 h-5 rounded bg-pro-accent flex items-center justify-center text-pro-bg font-black text-xs">
            S
          </div>
          <span className="font-bold tracking-wider text-pro-text">
            SAHAMLENS <span className="text-pro-accent font-mono text-[10px] px-1 py-0.5 rounded bg-pro-accent/15 border border-pro-accent/30">PRO</span>
          </span>
        </div>

        <div className="h-3.5 w-px bg-pro-border" />

        {/* Live IHSG Tape */}
        {ihsg ? (
          <div className="flex items-center gap-2 font-mono" data-tauri-drag-region>
            <span className="text-pro-textMuted text-[11px]">IHSG</span>
            <span className="text-pro-text font-semibold">
              {ihsg.price.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span
              className={`flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded ${
                ihsg.change >= 0 ? 'bg-pro-profitBg text-pro-profit' : 'bg-pro-lossBg text-pro-loss'
              }`}
            >
              {ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}%
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-pro-textSubtle text-[11px]" data-tauri-drag-region>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>Tersambung ke API...</span>
          </div>
        )}
      </div>

      {/* Universal Search & Command Trigger */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2 px-3 py-1 rounded-md bg-pro-surface hover:bg-pro-card border border-pro-border hover:border-pro-borderStrong transition text-pro-textMuted text-xs"
        >
          <Search size={13} className="text-pro-accent" />
          <span>Cari emiten (Ctrl+K)...</span>
          <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-pro-card border border-pro-border text-pro-textSubtle">
            Ctrl+K
          </kbd>
        </button>

        {/* LensAI Toggle Button */}
        <button
          onClick={onToggleAI}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition ${
            isAiOpen
              ? 'bg-pro-purple text-white shadow-lg shadow-purple-900/30'
              : 'bg-pro-purple/15 text-pro-purple border border-pro-purple/30 hover:bg-pro-purple/25'
          }`}
        >
          <Sparkles size={13} />
          <span>Lens AI</span>
        </button>

        {/* User Account / Role Badge */}
        {userSession.token ? (
          <div className="flex items-center gap-2 border-l border-pro-border pl-2">
            <span
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${
                userSession.role === 'admin'
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'bg-pro-card text-pro-text border-pro-border'
              }`}
              title={userSession.email}
            >
              {userSession.role === 'admin' && <ShieldCheck size={12} />}
              <span className="truncate max-w-[120px]">{userSession.email}</span>
            </span>
            <button
              onClick={onLogout}
              className="text-[11px] text-pro-textSubtle hover:text-pro-loss px-1.5 py-0.5 rounded hover:bg-pro-card transition"
              title="Keluar akun"
            >
              Keluar
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenLogin}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-pro-card hover:bg-pro-surface border border-pro-border hover:border-pro-accent text-xs text-pro-accent font-semibold transition"
          >
            <User size={12} />
            <span>Masuk Akun</span>
          </button>
        )}
      </div>

      {/* Window Controls (Native Action Handlers) */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleMinimize}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-pro-card text-pro-textMuted hover:text-pro-text transition active:bg-pro-border"
          title="Minimize"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-pro-card text-pro-textMuted hover:text-pro-text transition active:bg-pro-border"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <Copy size={11} /> : <Square size={11} />}
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-pro-loss hover:text-white text-pro-textMuted transition active:opacity-80"
          title="Close"
        >
          <X size={13} />
        </button>
      </div>
    </header>
  );
};
