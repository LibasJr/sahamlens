'use client';

import { Button } from '@/components/ui';
import { useLanguage } from '@/lib/i18n';

interface AnalysisViewModeToggleProps {
  mode: 'compact' | 'full';
  onChange: (mode: 'compact' | 'full') => void;
  className?: string;
}

export default function AnalysisViewModeToggle({ mode, onChange, className = '' }: AnalysisViewModeToggleProps) {
  const { t } = useLanguage();

  return (
    <div className={`flex items-center justify-between gap-3 border-y border-tv-border/70 py-2 ${className}`}>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-tv-text">{t('common.analysisViewModeTitle')}</div>
        <div className="text-[10px] leading-relaxed text-tv-muted">
          {t('common.analysisViewModeDesc')}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label={t('common.analysisViewModeAria')}>
        <Button variant="bare" size="none"
          type="button"
          onClick={() => onChange('compact')}
          aria-pressed={mode === 'compact'}
          className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${mode === 'compact' ? 'bg-tv-blue/10 text-tv-blue' : 'text-tv-muted hover:bg-white/[0.04] hover:text-tv-text'}`}
        >
          {t('common.modeCompact')}
        </Button>
        <Button variant="bare" size="none"
          type="button"
          onClick={() => onChange('full')}
          aria-pressed={mode === 'full'}
          className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${mode === 'full' ? 'bg-tv-blue/10 text-tv-blue' : 'text-tv-muted hover:bg-white/[0.04] hover:text-tv-text'}`}
        >
          {t('common.modeFull')}
        </Button>
      </div>
    </div>
  );
}
