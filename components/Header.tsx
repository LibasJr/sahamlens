'use client';

import React from 'react';
import { Menu } from 'lucide-react';
import CommandPalette from './CommandPalette';

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

export default function Header({
  currentTicker,
  onTickerChange,
  moduleTitle = 'LensAI Technical + Bandarmology',
  moduleBank = 'LENSAI',
  analisaRemaining,
  analisaTotal = 5,
  isAdmin = false
}: HeaderProps) {
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

        {/* BUG FIX (2026-08-05, unifikasi search - permintaan user): SEBELUMNYA input
            teks + SymbolAutocomplete sendiri di sini, terpisah dari search global
            TopMarketBar ("Cari saham...", components/AppShell.tsx) yang SUDAH tampil di
            atas halaman ini juga - dua UI pencarian beda gaya di satu layar. Sekarang
            pakai CommandPalette yang sama (satu komponen, satu sumber data /api/emiten),
            `onSelect` bikin pemilihan ganti ticker DI HALAMAN INI (bukan navigasi keluar
            kayak instance global). `enableShortcut={false}` WAJIB - instance global di
            TopMarketBar sudah pegang shortcut Ctrl/Cmd+K, tanpa ini kepencet dua modal
            sekaligus. */}
        <div className="relative w-full md:w-64">
          <CommandPalette
            onSelect={(symbol) => onTickerChange(symbol.toUpperCase())}
            enableShortcut={false}
          />
        </div>
      </div>

      {/* Module title/bank - sebelumnya diterima sebagai prop tapi tidak pernah
          dirender (dead prop, ditemukan saat smoke test brand rename 2026-08-03).
          Disembunyikan di mobile (layar sempit sudah penuh hamburger+search),
          konteks halaman di mobile tetap didapat dari Sidebar. */}
      <div className="hidden md:flex flex-col min-w-0 flex-1 px-2">
        <span className="text-[10px] font-sans text-tv-blue uppercase tracking-wider font-bold">{moduleBank}</span>
        <h2 className="text-sm font-heading font-bold text-tv-text truncate">{moduleTitle}</h2>
      </div>

      {/* Right side controls */}
      <div className="flex flex-wrap md:flex-nowrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">

        <div className="flex items-center gap-3">
          {/* Profil, badge role, dan logout sudah tersedia konsisten di footer Sidebar
              (semua halaman, termasuk halaman ini) - dihapus dari sini supaya tidak
              dobel di satu layar. Lihat components/Sidebar.tsx + UserProfileModal.tsx. */}
          {!isAdmin && typeof analisaRemaining === 'number' && Number.isFinite(analisaRemaining) && (
            <span className={`px-3 py-1.5 rounded-md border text-xs font-bold whitespace-nowrap ${
              analisaRemaining <= 0
                ? 'bg-tv-red/10 border-tv-red/30 text-tv-red'
                : 'bg-tv-green/10 border-tv-green/30 text-tv-green'
            }`}>
              <span className="hidden sm:inline">Limit: </span>{analisaRemaining}/{analisaTotal}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
