'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Header from './Header';
import { Card } from './ui/Card';
import { cn } from '../lib/utils/cn';
import { fadeUp } from '../lib/motion';

type ShellAccent = 'purple' | 'pink' | 'green' | 'red' | 'blue' | 'warning';

const ACCENT_CLASSES: Record<ShellAccent, string> = {
  purple: 'bg-tv-purple/10 border-tv-purple/30 text-tv-purple',
  pink: 'bg-pink-400/10 border-pink-400/30 text-pink-400',
  green: 'bg-tv-green/10 border-tv-green/30 text-tv-green',
  red: 'bg-tv-red/10 border-tv-red/30 text-tv-red',
  blue: 'bg-tv-blue/10 border-tv-blue/30 text-tv-blue',
  warning: 'bg-tv-warning/10 border-tv-warning/30 text-tv-warning',
};

interface TickerAnalysisShellProps {
  ticker: string;
  onTickerChange: (ticker: string) => void;
  moduleTitle: string;
  moduleBank: string;
  icon: React.ReactNode;
  accent: ShellAccent;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

// Redesign UI/UX Fase 3 - shell bersama untuk cluster halaman "satu analisis per
// ticker" (moat/pattern/earnings/dividend/risk/dcf) yang sebelumnya masing-masing
// menulis ulang wrapper+Header+kartu-judul sendiri-sendiri dengan gaya nyaris
// identik. Menyatukan: wrapper+Header, kartu judul (chip ikon + judul + subjudul +
// slot kontrol kanan lewat headerExtra), entrance motion. Konten spesifik tiap
// halaman (tabel, grid metrik) tetap di masing-masing page - shell TIDAK
// menyentuh logika/fetch data.
export function TickerAnalysisShell({
  ticker,
  onTickerChange,
  moduleTitle,
  moduleBank,
  icon,
  accent,
  title,
  subtitle,
  headerExtra,
  children,
}: TickerAnalysisShellProps) {
  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header currentTicker={ticker} onTickerChange={onTickerChange} moduleTitle={moduleTitle} moduleBank={moduleBank} />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        <motion.div initial="hidden" animate="show" variants={fadeUp}>
          <Card variant="default" padding="lg" className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={cn('w-12 h-12 rounded-lg grid place-items-center border shrink-0', ACCENT_CLASSES[accent])}>
                {icon}
              </div>
              <div>
                <h1 className="font-heading text-xl font-bold text-tv-text tracking-tight">{title}</h1>
                {subtitle && <p className="text-xs text-tv-muted mt-0.5">{subtitle}</p>}
              </div>
            </div>
            {headerExtra}
          </Card>
        </motion.div>

        {children}
      </div>
    </div>
  );
}

export default TickerAnalysisShell;
