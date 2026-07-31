'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, AlertCircle, TrendingUp, RefreshCw, BarChart2, Bell, Menu, LogOut, User } from 'lucide-react';
import SymbolAutocomplete from './SymbolAutocomplete';

interface HeaderProps {
  currentTicker: string;
  onTickerChange: (ticker: string) => void;
  moduleTitle?: string;
  moduleBank?: string;
  /** Sisa kuota analisa gratis hari ini. Infinity = Pro/Admin (unlimited), undefined = badge disembunyikan. */
  analisaRemaining?: number;
  analisaTotal?: number;
  isAdmin?: boolean;
}

const QUICK_TICKERS = [
  { symbol: 'BBCA', name: 'Bank BCA' },
  { symbol: 'BBRI', name: 'Bank BRI' },
  { symbol: 'BMRI', name: 'Bank Mandiri' },
  { symbol: 'TLKM', name: 'Telkom ID' },
  { symbol: 'ASII', name: 'Astra Intl' },
  { symbol: 'AMRT', name: 'Alfamart' },
  { symbol: 'ICBP', name: 'Indofood CBP' },
  { symbol: 'ADRO', name: 'Adaro Energy' },
  { symbol: 'GOTO', name: 'GoTo Tech' }
];

export default function Header({
  currentTicker,
  onTickerChange,
  moduleTitle = 'Council AI Technical + Bandarmology',
  moduleBank = 'COUNCIL AI',
  analisaRemaining,
  analisaTotal = 5,
  isAdmin = false
}: HeaderProps) {
  const [searchInput, setSearchInput] = useState(currentTicker);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(d => {
        if (d.authenticated && d.user) {
          setUser(d.user);
        }
      })
      .catch(e => console.error(e));
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      onTickerChange(searchInput.trim().toUpperCase());
    }
  };

  return (
    <header className="sticky top-0 z-20 flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-md shadow-md">
      
      {/* Top Mobile Row: Hamburger + Search */}
      <div className="flex items-center gap-3 w-full md:w-auto">
        <button 
          onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
          className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>

        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <SymbolAutocomplete
            containerClassName="w-full"
            value={searchInput}
            onChange={(val) => setSearchInput(val)}
            onSelect={(val) => {
              setSearchInput(val);
              onTickerChange(val.toUpperCase());
            }}
            onFocus={(e: any) => e.target.select()}
            placeholder="Cari Ticker (cth: BBCA)..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-14 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:bg-white/10 transition-colors font-mono"
          />
          <button
            type="submit"
            className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-[10px] font-mono rounded font-semibold transition-colors"
          >
            CARI
          </button>
        </form>
      </div>

      {/* Right side controls */}
      <div className="flex flex-wrap md:flex-nowrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
        
        {/* Quick Ticker Chips (Hidden on small mobile) */}
        <div className="hidden xl:flex items-center gap-1.5 overflow-x-auto max-w-sm py-1 mr-2 scrollbar-hide">
          {QUICK_TICKERS.map((t) => (
            <button
              key={t.symbol}
              onClick={() => {
                setSearchInput(t.symbol);
                onTickerChange(t.symbol);
              }}
              className={`px-2 py-1 rounded text-[11px] font-mono transition-all border shrink-0 ${
                currentTicker === t.symbol
                  ? 'bg-teal-500 text-white border-teal-500 font-bold shadow-sm shadow-teal-500/20'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10 border-white/5'
              }`}
            >
              {t.symbol}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* Email Auth Status & Logout */}
          {user && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono shrink-0">
              <User className="w-4 h-4 text-slate-400" />
              <span className="hidden sm:inline font-bold">
                {user.email?.split('@')[0]}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${user.role === 'admin' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-teal-500/20 text-teal-400 border border-teal-500/30'}`}>
                {user.role}
              </span>
              <button 
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' });
                  window.location.href = '/login';
                }}
                className="ml-2 text-rose-400 hover:text-rose-300 p-0.5 rounded hover:bg-white/5 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

          {!isAdmin && typeof analisaRemaining === 'number' && Number.isFinite(analisaRemaining) && (
            <span className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold whitespace-nowrap ${
              analisaRemaining <= 0
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : 'bg-teal-500/10 border-teal-500/30 text-teal-400'
            }`}>
              <span className="hidden sm:inline">Limit: </span>{analisaRemaining}/{analisaTotal}
            </span>
          )}

          <Link href="/watchlist" className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-mono hover:bg-blue-500/20 transition-colors shrink-0">
            <Bell className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline font-bold">Watchlist</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
