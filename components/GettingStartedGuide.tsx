'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, BookmarkPlus, Calculator, Search, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

const DISMISSED_KEY = 'sahamlens.getting-started.dismissed.v1';

type GettingStartedGuideProps = {
  /** Bertambah saat tombol pembuka di hero ditekan. */
  openRequest?: number;
  onVisibilityChange?: (visible: boolean) => void;
};

/** Panduan sekali lihat; dapat ditutup per browser dan dibuka lagi dari hero. */
export default function GettingStartedGuide({ openRequest = 0, onVisibilityChange }: GettingStartedGuideProps) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const nextVisible = window.localStorage.getItem(DISMISSED_KEY) !== '1';
    setVisible(nextVisible);
    onVisibilityChange?.(nextVisible);
  }, [onVisibilityChange]);

  useEffect(() => {
    if (openRequest <= 0) return;
    window.localStorage.removeItem(DISMISSED_KEY);
    setVisible(true);
    onVisibilityChange?.(true);
  }, [openRequest, onVisibilityChange]);

  if (!visible) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
    onVisibilityChange?.(false);
  };

  const steps = [
    { href: '/dashboard', icon: Search, title: t('guide.step1Title'), text: t('guide.step1Text') },
    { href: '/technical/BBCA.JK', icon: BarChart3, title: t('guide.step2Title'), text: t('guide.step2Text') },
    { href: '/dcf?symbol=BBCA', icon: Calculator, title: t('guide.step3Title'), text: t('guide.step3Text') },
    { href: '/watchlist', icon: BookmarkPlus, title: t('guide.step4Title'), text: t('guide.step4Text') },
  ];

  return (
    <section className="relative mb-8 overflow-hidden rounded-xl border border-tv-blue/25 bg-tv-blue/[0.07] p-4 sm:p-5" aria-label="Panduan mulai menggunakan SahamLens">
      <button type="button" onClick={dismiss} className="absolute right-3 top-3 rounded p-1 text-tv-muted transition hover:bg-tv-hover hover:text-tv-text" aria-label="Tutup panduan">
        <X className="h-4 w-4" />
      </button>
      <div className="pr-8">
        <h2 className="font-heading text-base font-bold text-tv-text">{t('guide.title')}</h2>
        <p className="mt-1 text-xs text-tv-muted">{t('guide.subtitle')}</p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map(({ href, icon: Icon, title, text }, index) => (
          <Link key={title} href={href} className="group flex min-h-16 items-center gap-3 rounded-lg border border-tv-border bg-tv-card/70 px-3 py-2.5 transition hover:border-tv-blue/50 hover:bg-tv-hover">
            <span className="font-number text-xs font-bold text-tv-blue">{index + 1}</span>
            <Icon className="h-4 w-4 shrink-0 text-tv-blue" aria-hidden="true" />
            <span>
              <span className="block text-xs font-semibold text-tv-text group-hover:text-white">{title}</span>
              <span className="block text-[11px] leading-snug text-tv-muted">{text}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
