'use client';

import React from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n';

/**
 * Footer situs - SATU sumber, dipakai landing dan seluruh halaman ber-shell.
 */
export default function SiteFooter({ className = '' }: { className?: string }) {
  const { t } = useLanguage();

  return (
    <footer
      className={`mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-tv-border bg-tv-card px-5 py-4 text-[11px] text-tv-muted ${className}`}
    >
      <span className="font-medium">
        {t('footer.disclaimer')}
      </span>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/privacy" className="hover:text-tv-text">{t('footer.privacy')}</Link>
        <Link href="/terms" className="hover:text-tv-text">{t('footer.terms')}</Link>
        <Link href="/disclaimer" className="hover:text-tv-text">{t('footer.disclaimerLink')}</Link>
        <Link href="/status" className="hover:text-tv-text">{t('footer.status')}</Link>
        <span className="rounded-full bg-tv-hover px-2.5 py-1 font-semibold">© {new Date().getFullYear()} SahamLens</span>
      </div>
    </footer>
  );
}
