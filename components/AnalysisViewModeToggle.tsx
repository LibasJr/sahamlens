'use client';

import { Button } from '@/components/ui';

interface AnalysisViewModeToggleProps {
  mode: 'compact' | 'full';
  onChange: (mode: 'compact' | 'full') => void;
  className?: string;
}

export default function AnalysisViewModeToggle({ mode, onChange, className = '' }: AnalysisViewModeToggleProps) {
  return (
    <div className={`flex items-center justify-between gap-3 border-y border-tv-border/70 py-2 ${className}`}>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-tv-text">Tampilan analisis</div>
        <div className="text-[10px] leading-relaxed text-tv-muted">
          Ringkas menampilkan inti. Lengkap membuka detail dan bukti.
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Pilih tampilan analisis">
        <Button variant="bare" size="none"
          type="button"
          onClick={() => onChange('compact')}
          aria-pressed={mode === 'compact'}
          className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${mode === 'compact' ? 'bg-tv-blue/10 text-tv-blue' : 'text-tv-muted hover:bg-white/[0.04] hover:text-tv-text'}`}
        >
          Ringkas
        </Button>
        <Button variant="bare" size="none"
          type="button"
          onClick={() => onChange('full')}
          aria-pressed={mode === 'full'}
          className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${mode === 'full' ? 'bg-tv-blue/10 text-tv-blue' : 'text-tv-muted hover:bg-white/[0.04] hover:text-tv-text'}`}
        >
          Lengkap
        </Button>
      </div>
    </div>
  );
}
