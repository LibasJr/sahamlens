'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Search, AlertCircle, TrendingUp, RefreshCw, BarChart2, Bell } from 'lucide-react';
import TelegramLogin from '@/components/TelegramLogin';

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
  moduleTitle = 'Citadel Technical + Bandarmology',
  moduleBank = 'CITADEL LLC',
  analisaRemaining,
  analisaTotal = 5,
  isAdmin = false
}: HeaderProps) {
  const [searchInput, setSearchInput] = useState(currentTicker);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      onTickerChange(searchInput.trim().toUpperCase());
    }
  };

  return (
    <header className="bg-tv-card border-b border-tv-border px-6 py-3 sticky top-0 z-20 shadow-md">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        {/* Left Module Badge & Title */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-tv-hover border border-tv-borderLight text-tv-green">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <h2 className="font-bold text-base sm:text-lg text-white tracking-tight whitespace-nowrap">{moduleTitle}</h2>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-tv-green/20 text-tv-green border border-tv-green/30 whitespace-nowrap">
                {moduleBank}
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-tv-muted font-mono hidden md:block">
              Empowered by yfinance IDX Market Data (.JK) & AI Agent Engine
            </p>
          </div>
        </div>

        {/* Center Search Bar & Quick Ticker Chips */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-tv-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              onFocus={(e) => e.target.select()}
              placeholder="Cari Ticker (cth: BBCA)..."
              className="w-full bg-tv-bg border border-tv-border rounded-lg pl-9 pr-14 py-1.5 text-xs text-white placeholder-tv-muted focus:outline-none focus:border-tv-green font-mono transition-colors"
            />
            <button
              type="submit"
              className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-1 bg-tv-green hover:bg-tv-greenHover text-white text-[10px] font-mono rounded font-semibold transition-colors"
            >
              CARI
            </button>
          </form>

          {/* Quick Ticker Chips */}
          <div className="hidden xl:flex items-center gap-1.5 overflow-x-auto max-w-md py-1">
            {QUICK_TICKERS.map((t) => (
              <button
                key={t.symbol}
                onClick={() => {
                  setSearchInput(t.symbol);
                  onTickerChange(t.symbol);
                }}
                className={`px-2 py-1 rounded text-[11px] font-mono transition-all border ${
                  currentTicker === t.symbol
                    ? 'bg-tv-green text-white border-tv-green font-bold shadow-sm'
                    : 'bg-tv-bg text-tv-text hover:bg-tv-hover border-tv-border'
                }`}
              >
                {t.symbol}
              </button>
            ))}
          </div>
        </div>

        {/* Right Legal Disclaimer Banner & Alert Button */}
        <div className="flex items-center gap-3">
          {/* Badge admin/login Telegram - lihat components/TelegramLogin.tsx */}
          <TelegramLogin />

          {!isAdmin && typeof analisaRemaining === 'number' && Number.isFinite(analisaRemaining) && (
            <span className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold whitespace-nowrap ${
              analisaRemaining <= 0
                ? 'bg-tv-red/10 border-tv-red/30 text-tv-red'
                : 'bg-[#14b8a6]/10 border-[#14b8a6]/30 text-[#14b8a6]'
            }`}>
              Sisa analisa gratis hari ini: {analisaRemaining}/{analisaTotal}
            </span>
          )}

          <Link href="/watchlist" className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-mono hover:bg-blue-500/20 transition-colors">
            <Bell className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline font-bold">Watchlist</span>
          </Link>

          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono shrink-0">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate hidden xl:inline">
              <strong>Disclaimer:</strong> Bukan saran finansial
            </span>
          </div>
        </div>

      </div>
    </header>
  );
}
