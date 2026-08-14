'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Sparkles } from 'lucide-react';

const CommandPalette = dynamic(() => import('./CommandPalette'), { ssr: false, loading: () => <div className="h-10 w-full animate-pulse rounded-xl bg-white/[0.035]" /> });

interface HeaderProps {
  currentTicker: string;
  onTickerChange: (ticker: string) => void;
  moduleTitle?: string;
  moduleBank?: string;
  analisaRemaining?: number;
  analisaTotal?: number;
  isAdmin?: boolean;
}

export default function Header({
  currentTicker,
  onTickerChange,
  moduleTitle = 'LensConsensus Technical + Bandarmology',
  moduleBank = 'LENSAI',
  analisaRemaining,
  analisaTotal = 5,
  isAdmin = false,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.055] bg-tv-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-tv-blue/15 bg-tv-blue/[0.08] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-tv-blue">
              <Sparkles className="h-3 w-3" /> {moduleBank}
            </span>
            {currentTicker && (
              <span className="font-number text-[10px] font-semibold text-tv-muted">
                {currentTicker.startsWith('^') ? 'IHSG' : `${currentTicker.replace('.JK', '')}.JK`}
              </span>
            )}
          </div>
          <h1 className="truncate text-lg font-bold tracking-tight text-white md:text-xl">{moduleTitle}</h1>
        </div>

        <div className="flex w-full items-center gap-2 md:w-auto">
          {/* BUG FIX (2026-08-14, laporan pengguna - dua ikon kaca pembesar tumpang
              tindih di HP): CommandPalette sudah merender ikon Search-nya sendiri di
              dalam tombol trigger-nya. Overlay ikon absolute + `[&_button]:pl-9` di
              sini dulunya menambahkan ikon KEDUA di atasnya - di layar sempit (teks
              placeholder disembunyikan, tersisa cuma ikon) kelihatan sebagai dua ikon
              search bersisian. */}
          <div className="relative min-w-0 flex-1 md:w-[320px] md:flex-none">
            <CommandPalette
              onSelect={(symbol) => onTickerChange(symbol.toUpperCase())}
              enableShortcut={false}
            />
          </div>

          {!isAdmin && typeof analisaRemaining === 'number' && Number.isFinite(analisaRemaining) && (
            <span className={`hidden whitespace-nowrap rounded-xl border px-3 py-2 text-[10px] font-bold sm:inline-flex ${
              analisaRemaining <= 0
                ? 'border-tv-red/20 bg-tv-red/10 text-tv-red'
                : 'border-tv-green/15 bg-tv-green/[0.08] text-tv-green'
            }`}>
              {analisaRemaining}/{analisaTotal} analisa
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
