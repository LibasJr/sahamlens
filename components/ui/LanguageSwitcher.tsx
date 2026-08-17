'use client';

import React from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

interface LanguageSwitcherProps {
  variant?: 'pill' | 'compact' | 'sidebar';
  className?: string;
}

export default function LanguageSwitcher({ variant = 'pill', className = '' }: LanguageSwitcherProps) {
  const { language, setLanguage, toggleLanguage } = useLanguage();

  if (variant === 'sidebar') {
    return (
      <div className={`flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] p-1.5 ${className}`}>
        <div className="flex items-center gap-2 px-2 text-xs font-semibold text-tv-muted">
          <Globe className="h-3.5 w-3.5 text-tv-blue" />
          <span>{language === 'id' ? 'Bahasa' : 'Language'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLanguage('id')}
            className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all ${
              language === 'id'
                ? 'bg-tv-blue text-white shadow-sm'
                : 'text-tv-muted hover:text-tv-text hover:bg-white/[0.04]'
            }`}
            aria-label="Pilih Bahasa Indonesia"
          >
            ID
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all ${
              language === 'en'
                ? 'bg-tv-blue text-white shadow-sm'
                : 'text-tv-muted hover:text-tv-text hover:bg-white/[0.04]'
            }`}
            aria-label="Select English"
          >
            EN
          </button>
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={toggleLanguage}
        title={language === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
        aria-label={language === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-tv-border bg-tv-card text-xs font-bold text-tv-text shadow-2 transition-all hover:-translate-y-0.5 hover:border-tv-borderLight hover:bg-tv-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue md:h-9 md:w-9 font-number ${className}`}
      >
        <span className="text-[11px] font-extrabold tracking-wider">{language === 'id' ? 'ID' : 'EN'}</span>
      </button>
    );
  }

  // Default 'pill' variant for navbar
  return (
    <div
      className={`inline-flex items-center rounded-xl border border-tv-border bg-tv-card p-0.5 shadow-sm text-xs font-bold ${className}`}
      role="group"
      aria-label="Pilihan Bahasa / Language Selection"
    >
      <button
        type="button"
        onClick={() => setLanguage('id')}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-all text-[11px] font-number ${
          language === 'id'
            ? 'bg-tv-blue text-white shadow-sm font-bold'
            : 'text-tv-muted hover:text-tv-text hover:bg-tv-hover'
        }`}
        aria-pressed={language === 'id'}
        aria-label="Bahasa Indonesia"
      >
        <span>🇮🇩</span>
        <span>ID</span>
      </button>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-all text-[11px] font-number ${
          language === 'en'
            ? 'bg-tv-blue text-white shadow-sm font-bold'
            : 'text-tv-muted hover:text-tv-text hover:bg-tv-hover'
        }`}
        aria-pressed={language === 'en'}
        aria-label="English"
      >
        <span>🇬🇧</span>
        <span>EN</span>
      </button>
    </div>
  );
}
