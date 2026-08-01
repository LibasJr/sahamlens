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
    <header className="sticky top-0 z-20 flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border-b border-tv-border bg-tv-surface/90 backdrop-blur-md shadow-2">

      {/* Top Mobile Row: Hamburger + Search */}
      <div className="flex items-center gap-3 w-full md:w-auto">
        <button
          onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
          className="md:hidden p-2 -ml-2 text-tv-muted hover:text-tv-text rounded-md hover:bg-tv-hover transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>

        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-tv-muted absolute left-3 top-1/2 -translate-y-1/2" />
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
            className="w-full bg-tv-hover/60 border border-tv-border rounded-md pl-9 pr-14 py-2 text-sm text-tv-text placeholder-tv-muted focus:outline-none focus:border-tv-blue transition-colors font-number"
          />
          <button
            type="submit"
            className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gradient-accent hover:brightness-110 text-white text-[10px] rounded font-semibold transition-all"
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
              className={`px-2 py-1 rounded text-[11px] font-number transition-all border shrink-0 ${
                currentTicker === t.symbol
                  ? 'bg-tv-green text-white border-tv-green font-bold'
                  : 'bg-tv-hover/60 text-tv-muted hover:bg-tv-hover border-tv-border'
              }`}
            >
              {t.symbol}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* Email Auth Status & Logout */}
          {user && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-tv-hover/60 border border-tv-border text-tv-text text-xs shrink-0">
              <User className="w-4 h-4 text-tv-muted" />
              <span className="hidden sm:inline font-bold">
                {user.email?.split('@')[0]}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${user.role === 'admin' ? 'bg-tv-warning/20 text-tv-warning border border-tv-warning/30' : 'bg-tv-green/20 text-tv-green border border-tv-green/30'}`}>
                {user.role}
              </span>
              <button
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' });
                  window.location.href = '/login';
                }}
                className="ml-2 text-tv-red hover:text-tv-red/80 p-0.5 rounded hover:bg-tv-hover transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

          {!isAdmin && typeof analisaRemaining === 'number' && Number.isFinite(analisaRemaining) && (
            <span className={`px-3 py-1.5 rounded-md border text-xs font-bold whitespace-nowrap ${
              analisaRemaining <= 0
                ? 'bg-tv-red/10 border-tv-red/30 text-tv-red'
                : 'bg-tv-green/10 border-tv-green/30 text-tv-green'
            }`}>
              <span className="hidden sm:inline">Limit: </span>{analisaRemaining}/{analisaTotal}
            </span>
          )}

          <Link href="/watchlist" className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-tv-blue/10 border border-tv-blue/30 text-tv-blue text-xs hover:bg-tv-blue/20 transition-colors shrink-0">
            <Bell className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline font-bold">Watchlist</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
