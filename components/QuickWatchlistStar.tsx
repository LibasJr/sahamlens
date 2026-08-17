'use client';

import React, { useState, useEffect } from 'react';
import { Star } from 'lucide-react';

interface QuickWatchlistStarProps {
  ticker: string;
  className?: string;
  showLabel?: boolean;
}

const LOCAL_STORAGE_KEY = 'sahamlens_local_watchlist';

export function QuickWatchlistStar({
  ticker,
  className = '',
  showLabel = false,
}: QuickWatchlistStarProps) {
  const cleanTicker = ticker.replace('.JK', '').toUpperCase();
  const [isSaved, setIsSaved] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Check saved state on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const list: string[] = JSON.parse(stored);
        if (Array.isArray(list) && list.includes(cleanTicker)) {
          setIsSaved(true);
        }
      }

      // Check server API if logged in
      fetch('/api/watchlist')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (Array.isArray(data)) {
            const hasTicker = data.some(
              (item: any) => (item.symbol || item.ticker || '').toUpperCase() === cleanTicker
            );
            if (hasTicker) {
              setIsSaved(true);
              // Sync to local
              const storedList = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
              if (!storedList.includes(cleanTicker)) {
                storedList.push(cleanTicker);
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(storedList));
              }
            }
          }
        })
        .catch(() => {});
    } catch {
      // Ignore local storage error
    }
  }, [cleanTicker]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 500);

    const nextState = !isSaved;
    setIsSaved(nextState);

    // Update local storage
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      let list: string[] = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(list)) list = [];

      if (nextState) {
        if (!list.includes(cleanTicker)) list.push(cleanTicker);
      } else {
        list = list.filter((t) => t !== cleanTicker);
      }
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
    } catch {}

    // Sync to API (fail-silent if guest)
    try {
      if (nextState) {
        await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: cleanTicker }),
        });
      } else {
        await fetch(`/api/watchlist?symbol=${cleanTicker}`, {
          method: 'DELETE',
        });
      }
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      title={isSaved ? `Hapus ${cleanTicker} dari Watchlist` : `Tambah ${cleanTicker} ke Watchlist`}
      aria-label={isSaved ? `Hapus ${cleanTicker} dari Watchlist` : `Tambah ${cleanTicker} ke Watchlist`}
      className={`group relative inline-flex items-center gap-1.5 rounded-xl p-2 transition-all duration-200 ${
        isSaved
          ? 'bg-amber-500/15 border border-amber-500/40 text-amber-500 dark:text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
          : 'bg-tv-card border border-tv-border text-tv-muted hover:text-tv-text hover:bg-tv-hover hover:border-tv-borderLight'
      } ${className}`}
    >
      <Star
        className={`h-4 w-4 transition-transform duration-300 ${
          isSaved ? 'fill-amber-400 text-amber-500 dark:text-amber-400' : 'text-tv-muted group-hover:text-tv-text'
        } ${isAnimating ? 'scale-135 rotate-12' : 'scale-100'}`}
      />
      {showLabel && (
        <span className="text-xs font-bold font-number">
          {isSaved ? 'Tersimpan' : 'Watchlist'}
        </span>
      )}
    </button>
  );
}
