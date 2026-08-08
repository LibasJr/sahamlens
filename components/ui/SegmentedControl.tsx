'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils/cn';

interface SegmentedControlOption { label: string; value: string; }
interface SegmentedControlProps { options: SegmentedControlOption[]; value: string; onChange: (value: string) => void; layoutId?: string; className?: string; }

export function SegmentedControl({ options, value, onChange, layoutId = 'segmented-control', className }: SegmentedControlProps) {
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/15 p-1', className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button key={opt.value} type="button" onClick={() => onChange(opt.value)} className={cn('relative rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors', active ? 'text-white' : 'text-tv-muted hover:text-white')}>
            {active && <motion.span layoutId={layoutId} className="absolute inset-0 z-0 rounded-lg border border-tv-blue/20 bg-tv-blue/15" transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }} />}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
export default SegmentedControl;
