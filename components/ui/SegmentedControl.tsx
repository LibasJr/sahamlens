'use client';

import React from 'react';
import { cn } from '../../lib/utils/cn';

interface SegmentedControlOption { label: string; value: string; }
interface SegmentedControlProps { options: SegmentedControlOption[]; value: string; onChange: (value: string) => void; layoutId?: string; className?: string; }

export function SegmentedControl({ options, value, onChange, className }: SegmentedControlProps) {
  return (
    <div className={cn('inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-black/15 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative min-h-9 shrink-0 rounded-lg border px-3 text-[11px] font-semibold transition-colors duration-150',
              active
                ? 'border-tv-blue/20 bg-tv-blue/15 text-white'
                : 'border-transparent text-tv-muted hover:bg-white/[0.04] hover:text-white',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
export default SegmentedControl;
