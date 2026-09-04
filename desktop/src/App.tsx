import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { CommandRail, type ActiveModule } from './components/CommandRail';
import { ChartWorkspace } from './components/ChartWorkspace';
import { BacktestView } from './components/BacktestView';
import { LensAIDrawer } from './components/LensAIDrawer';
import { CommandPalette } from './components/CommandPalette';
import { ModuleViews } from './components/ModuleViews';
import { LoginModal } from './components/LoginModal';
import {
  fetchMarketData,
  getSavedSession,
  clearSession,
  type MarketPulse,
  type UserSession,
} from './api';

export function App() {
  const [selectedTicker, setSelectedTicker] = useState('BBCA');
  const [activeModule, setActiveModule] = useState<ActiveModule>('overview');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [marketPulse, setMarketPulse] = useState<MarketPulse | null>(null);
  const [userSession, setUserSession] = useState<UserSession>(() => getSavedSession());

  useEffect(() => {
    fetchMarketData().then(setMarketPulse);
    const interval = setInterval(() => {
      fetchMarketData().then(setMarketPulse);
    }, 45_000);
    return () => clearInterval(interval);
  }, []);

  // Global Hotkey listener (Ctrl+K, Ctrl+J)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setIsAiOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectTicker = (ticker: string) => {
    const clean = ticker.trim().toUpperCase().replace('.JK', '');
    if (clean) {
      setSelectedTicker(clean);
      if (activeModule === 'overview' || activeModule === 'market-pulse') {
        setActiveModule('technical');
      }
    }
  };

  const handleLogout = () => {
    clearSession();
    setUserSession({ email: '', role: 'guest', token: null });
    if (activeModule === 'admin-stats' || activeModule === 'watchlist') {
      setActiveModule('overview');
    }
  };

  const handleLoginSuccess = (session: { email: string; role: string }) => {
    setUserSession(getSavedSession());
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-pro-bg text-pro-text overflow-hidden select-none">
      {/* 1. Frameless Modern Window Titlebar with Window Controls & User Auth */}
      <TitleBar
        marketPulse={marketPulse}
        onOpenSearch={() => setIsSearchOpen(true)}
        onToggleAI={() => setIsAiOpen((prev) => !prev)}
        isAiOpen={isAiOpen}
        userSession={userSession}
        onOpenLogin={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
      />

      {/* 2. Main Terminal Body (Command Rail + Main Stage + LensAI Drawer) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Navigation Command Rail */}
        <CommandRail
          activeModule={activeModule}
          onSelectModule={setActiveModule}
          collapsed={railCollapsed}
          onToggleCollapse={() => setRailCollapsed((prev) => !prev)}
          selectedTicker={selectedTicker}
          userSession={userSession}
        />

        {/* Main Dynamic Stage */}
        <main className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-pro-bg">
          {/* Top Quick Ticker Bar (When in Research Mode) */}
          <div className="flex items-center justify-between bg-pro-surface border border-pro-border px-3 py-2 rounded-xl text-xs">
            <div className="flex items-center gap-3">
              <span className="text-pro-textSubtle font-mono uppercase tracking-wider text-[11px]">
                Fokus Riset:
              </span>
              <div className="flex items-center gap-1.5 font-mono">
                <span className="font-bold text-sm text-pro-accent">{selectedTicker}</span>
                <span className="text-pro-textSubtle">• BEI</span>
              </div>
            </div>

            {/* Quick module tabs */}
            <div className="flex items-center gap-1 font-mono text-[11px]">
              {(['overview', 'technical', 'fundamental', 'valuation', 'radar', 'screener', 'backtest', 'news'] as ActiveModule[]).map(
                (mod) => (
                  <button
                    key={mod}
                    onClick={() => setActiveModule(mod)}
                    className={`px-2.5 py-1 rounded-md capitalize transition ${
                      activeModule === mod
                        ? 'bg-pro-accent text-pro-bg font-bold'
                        : 'text-pro-textMuted hover:text-pro-text hover:bg-pro-card'
                    }`}
                  >
                    {mod}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Dual-View Terminal: Chart Workspace + Right Intelligence Panel */}
          {activeModule === 'technical' || activeModule === 'overview' ? (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5">
              <div className="xl:col-span-2">
                <ChartWorkspace ticker={selectedTicker} />
              </div>
              <div className="xl:col-span-1">
                <ModuleViews
                  module={activeModule}
                  selectedTicker={selectedTicker}
                  onSelectTicker={handleSelectTicker}
                  marketPulse={marketPulse}
                  userSession={userSession}
                  onOpenLogin={() => setIsLoginOpen(true)}
                />
              </div>
            </div>
          ) : activeModule === 'backtest' ? (
            <BacktestView
              selectedTicker={selectedTicker}
              onSelectTicker={handleSelectTicker}
            />
          ) : (
            <ModuleViews
              module={activeModule}
              selectedTicker={selectedTicker}
              onSelectTicker={handleSelectTicker}
              marketPulse={marketPulse}
              userSession={userSession}
              onOpenLogin={() => setIsLoginOpen(true)}
            />
          )}
        </main>

        {/* Right Slide-out LensAI Copilot Drawer */}
        <LensAIDrawer
          isOpen={isAiOpen}
          onClose={() => setIsAiOpen(false)}
          selectedTicker={selectedTicker}
        />
      </div>

      {/* Universal Search Spotlight Palette */}
      <CommandPalette
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectTicker={handleSelectTicker}
      />

      {/* Native Login Modal Dialog */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  );
}

export default App;
