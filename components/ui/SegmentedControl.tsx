'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils/cn';

interface SegmentedControlOption {
  label: string;
  value: string;
}

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  layoutId?: string;
  className?: string;
}

// Redesign UI/UX Fase 1 - pengganti pola tombol grup yang sebelumnya ditulis
// manual berulang-ulang (pemilih timeframe di dashboard, pemilih sektor di moat,
// filter chip di screener) - satu komponen, indikator aktif bergeser mulus pakai
// teknik layoutId yang sama seperti components/Sidebar.tsx.
export function SegmentedControl({ options, value, onChange, layoutId = 'segmented-control', className }: SegmentedControlProps) {
  return (
    <div className={cn('inline-flex items-center gap-0.5 bg-tv-hover/60 border border-tv-border rounded-md p-1', className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors duration-150',
              active ? 'text-white' : 'text-tv-muted hover:text-tv-text'
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 z-0 bg-gradient-accent rounded-sm"
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
