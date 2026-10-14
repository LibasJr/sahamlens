'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Star } from 'lucide-react';
import { apiRequest } from '@/shared/http/api-client';

interface QuickTickerSwitcherProps {
  currentTicker: string;
  onSelectTicker: (ticker: string) => void;
  className?: string;
}

const DEFAULT_POPULAR_TICKERS = [
  'BBCA',
  'BBRI',
  'BMRI',
  'TLKM',
  'ASII',
  'BREN',
  'GOTO',
  'AMMN',
  'UNTR',
  'MEDC',
];

const LOCAL_STORAGE_WATCHLIST_KEY = 'sahamlens_local_watchlist';
const LOCAL_STORAGE_LAST_SEARCH_KEY = 'last_searched_ticker';

export default function QuickTickerSwitcher({
  currentTicker,
  onSelectTicker,
  className = '',
}: QuickTickerSwitcherProps) {
  const [personalTickers, setPersonalTickers] = useState<string[]>([]);
  const [isCurrentSaved, setIsCurrentSaved] = useState(false);
  const [isStarAnimating, setIsStarAnimating] = useState(false);

  const cleanCurrent = useMemo(() => {
    if (!currentTicker) return '';
    return currentTicker.startsWith('^')
      ? 'IHSG'
      : currentTicker.trim().toUpperCase().replace(/\.JK$/, '');
  }, [currentTicker]);

  useEffect(() => {
    try {
      const personalSet = new Set<string>();

      // 1. Baca watchlist lokal
      const storedWl = localStorage.getItem(LOCAL_STORAGE_WATCHLIST_KEY);
      if (storedWl) {
        const parsed = JSON.parse(storedWl);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const clean = String(item).trim().toUpperCase().replace(/\.JK$/, '');
            if (/^[A-Z]{4}$/.test(clean)) personalSet.add(clean);
          }
        }
      }

      // 2. Baca emiten terakhir dicari
      const lastSearch = localStorage.getItem(LOCAL_STORAGE_LAST_SEARCH_KEY);
      if (lastSearch) {
        const clean = lastSearch.trim().toUpperCase().replace(/\.JK$/, '');
        if (/^[A-Z]{4}$/.test(clean)) personalSet.add(clean);
      }

      setPersonalTickers(Array.from(personalSet));

      if (cleanCurrent && personalSet.has(cleanCurrent)) {
        setIsCurrentSaved(true);
      }
    } catch {
      // Abaikan kegagalan localStorage
    }
  }, [cleanCurrent]);

  const displayTickers = useMemo(() => {
    const set = new Set<string>();

    // Sertakan ticker saat ini bila valid 4 huruf
    if (cleanCurrent && /^[A-Z]{4}$/.test(cleanCurrent)) {
      set.add(cleanCurrent);
    }

    // Tambahkan personal tickers
    for (const t of personalTickers) {
      set.add(t);
      if (set.size >= 8) break;
    }

    // Tambahkan default liquidity leaders sampai kuota 10
    for (const t of DEFAULT_POPULAR_TICKERS) {
      set.add(t);
      if (set.size >= 10) break;
    }

    return Array.from(set);
  }, [cleanCurrent, personalTickers]);

  const handleToggleWatchlist = async () => {
    if (!cleanCurrent || cleanCurrent === 'IHSG' || !/^[A-Z]{4}$/.test(cleanCurrent)) return;

    setIsStarAnimating(true);
    setTimeout(() => setIsStarAnimating(false), 500);

    const nextSaved = !isCurrentSaved;
    setIsCurrentSaved(nextSaved);

    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_WATCHLIST_KEY);
      let list: string[] = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(list)) list = [];

      if (nextSaved) {
        if (!list.includes(cleanCurrent)) list.push(cleanCurrent);
      } else {
        list = list.filter((item) => item !== cleanCurrent);
      }
      localStorage.setItem(LOCAL_STORAGE_WATCHLIST_KEY, JSON.stringify(list));
      window.dispatchEvent(new Event('watchlist-updated'));

      // Sinkron ke API jika sesi login aktif
      if (nextSaved) {
        await apiRequest('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: `${cleanCurrent}.JK` }),
        }).catch(() => {});
      } else {
        await apiRequest(`/api/watchlist?symbol=${encodeURIComponent(`${cleanCurrent}.JK`)}`, {
          method: 'DELETE',
        }).catch(() => {});
      }
    } catch {
      // Abaikan error sinkronisasi
    }
  };

  return (
    <div
      className={`flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 ${className}`}
      aria-label="Pilihan cepat emiten"
    >
      <span className="shrink-0 text-[11px] font-semibold text-tv-muted uppercase tracking-wider pl-1">
        Pilihan:
      </span>

      {displayTickers.map((ticker) => {
        const isActive = cleanCurrent === ticker;
        return (
          <Button
            key={ticker}
            variant="bare"
            size="none"
            type="button"
            onClick={() => onSelectTicker(ticker)}
            aria-pressed={isActive}
            className={`min-h-8 shrink-0 rounded-full px-3 py-1 font-mono text-xs font-bold transition-all active:scale-95 ${
              isActive
                ? 'border border-tv-blue bg-tv-blue text-white shadow-sm shadow-tv-blue/25'
                : 'border border-white/[0.08] bg-white/[0.04] text-tv-muted hover:border-white/[0.18] hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            {ticker}
          </Button>
        );
      })}

      {/* Tombol Cepat Simpan Watchlist */}
      {cleanCurrent && cleanCurrent !== 'IHSG' && /^[A-Z]{4}$/.test(cleanCurrent) && (
        <Button
          variant="bare"
          size="none"
          type="button"
          onClick={handleToggleWatchlist}
          title={isCurrentSaved ? `Hapus ${cleanCurrent} dari Watchlist` : `Simpan ${cleanCurrent} ke Watchlist`}
          className={`min-h-8 shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border transition-all active:scale-95 ${
            isCurrentSaved
              ? 'border-tv-yellow/30 bg-tv-yellow/15 text-tv-yellow'
              : 'border-white/[0.08] bg-white/[0.04] text-tv-muted hover:text-tv-yellow hover:border-tv-yellow/30'
          } ${isStarAnimating ? 'scale-110' : ''}`}
        >
          <Star className={`h-3.5 w-3.5 ${isCurrentSaved ? 'fill-tv-yellow text-tv-yellow' : ''}`} />
          <span className="text-[11px]">{isCurrentSaved ? 'Tersimpan' : 'Watchlist +'}</span>
        </Button>
      )}
    </div>
  );
}
