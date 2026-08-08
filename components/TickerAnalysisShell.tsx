'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Header from './Header';
import { Card } from './ui/Card';
import { PageContainer } from './ui/PageContainer';
import { cn } from '../lib/utils/cn';
import { fadeUp } from '../lib/motion';

type ShellAccent = 'purple' | 'pink' | 'green' | 'red' | 'blue' | 'warning';

const ACCENT_CLASSES: Record<ShellAccent, string> = {
  purple: 'border-tv-purple/20 bg-tv-purple/10 text-tv-purple',
  pink: 'border-pink-400/20 bg-pink-400/10 text-pink-400',
  green: 'border-tv-green/20 bg-tv-green/10 text-tv-green',
  red: 'border-tv-red/20 bg-tv-red/10 text-tv-red',
  blue: 'border-tv-blue/20 bg-tv-blue/10 text-tv-blue',
  warning: 'border-tv-warning/20 bg-tv-warning/10 text-tv-warning',
};

interface TickerAnalysisShellProps {
  ticker: string;
  onTickerChange: (ticker: string) => void;
  moduleTitle: string;
  moduleBank?: string;
  icon: React.ReactNode;
  accent: ShellAccent;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

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
    <div className="flex min-h-screen flex-1 flex-col bg-tv-bg">
      <Header currentTicker={ticker} onTickerChange={onTickerChange} moduleTitle={moduleTitle} moduleBank={moduleBank} />

      <PageContainer className="space-y-6 p-4 md:p-6 lg:p-7">
        <motion.div initial="hidden" animate="show" variants={fadeUp}>
          <Card
            variant="glass"
            padding="lg"
            className="flex flex-col gap-5 border-white/[0.08] bg-gradient-to-br from-white/[0.025] via-tv-card/85 to-tv-blue/[0.025] md:flex-row md:items-center md:justify-between"
          >
            <div className="flex min-w-0 items-center gap-4">
              <div className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-2xl border shadow-inner', ACCENT_CLASSES[accent])}>
                {icon}
              </div>
              <div className="min-w-0">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-tv-muted">Analysis workspace</div>
                <h1 className="font-heading text-xl font-bold tracking-tight text-tv-text md:text-2xl">{title}</h1>
                {subtitle && <p className="mt-1 max-w-3xl text-xs leading-relaxed text-tv-muted">{subtitle}</p>}
              </div>
            </div>
            {headerExtra && <div className="w-full shrink-0 md:w-auto">{headerExtra}</div>}
          </Card>
        </motion.div>

        {children}
      </PageContainer>
    </div>
  );
}

export default TickerAnalysisShell;
