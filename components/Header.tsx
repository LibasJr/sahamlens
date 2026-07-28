'use client';

import React, { useState } from 'react';
import { Search, AlertCircle, TrendingUp, RefreshCw, BarChart2 } from 'lucide-react';

interface HeaderProps {
  currentTicker: string;
  onTickerChange: (ticker: string) => void;
  moduleTitle?: string;
  moduleBank?: string;
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
  moduleBank = 'CITADEL LLC'
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
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-lg text-white tracking-tight">{moduleTitle}</h2>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-tv-green/20 text-tv-green border border-tv-green/30">
                {moduleBank}
              </span>
            </div>
            <p className="text-xs text-tv-muted font-mono">
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

        {/* Right Legal Disclaimer Banner */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">
              <strong>Disclaimer:</strong> Bukan saran finansial, untuk edukasi
            </span>
          </div>
        </div>

      </div>
    </header>
  );
}
