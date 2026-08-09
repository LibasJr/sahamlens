'use client';

interface AnalysisViewModeToggleProps {
  mode: 'compact' | 'full';
  onChange: (mode: 'compact' | 'full') => void;
  className?: string;
}

export default function AnalysisViewModeToggle({ mode, onChange, className = '' }: AnalysisViewModeToggleProps) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl border border-tv-border bg-tv-card/70 p-2 ${className}`}>
      <div className="min-w-0 px-1">
        <div className="text-xs font-semibold text-tv-text">Tampilan analisis</div>
        <div className="text-[10px] leading-relaxed text-tv-muted">
          Ringkas menampilkan inti analisis. Lengkap membuka seluruh indikator.
        </div>
      </div>
      <div className="flex shrink-0 rounded-lg border border-tv-border bg-tv-bg p-1" role="group" aria-label="Pilih tampilan analisis">
        <button
          type="button"
          onClick={() => onChange('compact')}
          aria-pressed={mode === 'compact'}
          className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${mode === 'compact' ? 'bg-tv-blue/20 text-tv-blue' : 'text-tv-muted hover:text-tv-text'}`}
        >
          Ringkas
        </button>
        <button
          type="button"
          onClick={() => onChange('full')}
          aria-pressed={mode === 'full'}
          className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${mode === 'full' ? 'bg-tv-blue/20 text-tv-blue' : 'text-tv-muted hover:text-tv-text'}`}
        >
          Lengkap
        </button>
      </div>
    </div>
  );
}
