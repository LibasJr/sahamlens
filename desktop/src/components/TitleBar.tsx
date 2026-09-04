import React, { useEffect, useState } from 'react';
import { Minus, Square, Copy, X, Search, Sparkles, TrendingUp, TrendingDown, Wifi, WifiOff } from 'lucide-react';
import { type MarketPulse } from '../api';

interface TitleBarProps {
  marketPulse: MarketPulse | null;
  onOpenSearch: () => void;
  onToggleAI: () => void;
  isAiOpen: boolean;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  marketPulse,
  onOpenSearch,
  onToggleAI,
  isAiOpen,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    // Check if running in Tauri
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      setIsTauri(true);
    }
  }, []);

  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch {
      // Running in browser dev
    }
  };

  const handleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      if (await win.isMaximized()) {
        await win.unmaximize();
        setIsMaximized(false);
      } else {
        await win.maximize();
        setIsMaximized(true);
      }
    } catch {
      setIsMaximized(!isMaximized);
    }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch {
      // fallback
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
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-pro-accent flex items-center justify-center text-pro-bg font-black text-xs">
            S
          </div>
          <span className="font-bold tracking-wider text-pro-text">SAHAMLENS <span className="text-pro-accent font-mono text-[10px] px-1 py-0.5 rounded bg-pro-accent/15 border border-pro-accent/30">PRO</span></span>
        </div>

        {/* Vertical Separator */}
        <div className="h-3.5 w-px bg-pro-border" />

        {/* Live IHSG Tape */}
        {ihsg ? (
          <div className="flex items-center gap-2 font-mono">
            <span className="text-pro-textMuted text-[11px]">IHSG</span>
            <span className="text-pro-text font-semibold">{ihsg.price.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className={`flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded ${ihsg.change >= 0 ? 'bg-pro-profitBg text-pro-profit' : 'bg-pro-lossBg text-pro-loss'}`}>
              {ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}%
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-pro-textSubtle text-[11px]">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>Menghubungkan Data Pasar...</span>
          </div>
        )}

        {/* Movers Preview */}
        {marketPulse?.topGainers && marketPulse.topGainers.length > 0 && (
          <div className="hidden lg:flex items-center gap-2 border-l border-pro-border pl-3 font-mono text-[11px]">
            <span className="text-pro-textSubtle">Top:</span>
            {marketPulse.topGainers.slice(0, 2).map((g) => (
              <span key={g.symbol} className="text-pro-profit flex items-center gap-0.5">
                {g.symbol} +{g.changePct.toFixed(1)}%
              </span>
            ))}
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
          <span>Cari emiten, sinyal, atau tools...</span>
          <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-pro-card border border-pro-border text-pro-textSubtle">Ctrl+K</kbd>
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
      </div>

      {/* Window Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleMinimize}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-pro-card text-pro-textMuted hover:text-pro-text transition"
          title="Minimize"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={handleMaximize}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-pro-card text-pro-textMuted hover:text-pro-text transition"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <Copy size={11} /> : <Square size={11} />}
        </button>
        <button
          onClick={handleClose}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-pro-loss hover:text-white text-pro-textMuted transition"
          title="Close"
        >
          <X size={13} />
        </button>
      </div>
    </header>
  );
};
