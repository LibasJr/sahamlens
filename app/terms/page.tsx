'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Mail,
  Scale,
  Target,
  AlertTriangle,
  Database,
  ShieldCheck,
  Lock,
  Ban,
  RefreshCw,
  CreditCard,
  Copyright,
  Gavel,
  HelpCircle,
} from 'lucide-react';
import { Card, PageContainer } from '@/components/ui';
import { useLanguage } from '@/lib/i18n';

const LAST_UPDATED = '2026-09-24';

const SECTIONS = [
  { icon: Target, key: 'sectionTool' },
  { icon: AlertTriangle, key: 'sectionResponsibility' },
  { icon: Database, key: 'sectionData' },
  { icon: ShieldCheck, key: 'sectionSignals' },
  { icon: Lock, key: 'sectionSecurity' },
  { icon: Scale, key: 'sectionAllowed' },
  { icon: Ban, key: 'sectionProhibited' },
  { icon: RefreshCw, key: 'sectionAvailability' },
  { icon: Gavel, key: 'sectionAccountRestriction' },
  { icon: CreditCard, key: 'sectionSubscription' },
  { icon: Copyright, key: 'sectionIp' },
  { icon: Gavel, key: 'sectionLiability' },
  { icon: HelpCircle, key: 'sectionChanges' },
] as const;

export default function TermsPage() {
  const { t } = useLanguage();

  return (
    <PageContainer className="p-4 md:p-6 max-w-3xl">
      <Link
        href="/"
        className="mb-6 inline-flex min-h-6 items-center gap-1.5 text-sm text-tv-muted transition-colors hover:text-tv-text"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('contactPage.backToHome')}
      </Link>

      <Card
        padding="none"
        className="relative overflow-hidden bg-gradient-accent-soft border border-tv-border/60 px-6 py-10 sm:px-10 sm:py-12 shadow-none"
      >
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-glow-purple blur-3xl" />
        <div className="pointer-events-none absolute -left-24 -bottom-16 h-64 w-64 rounded-full bg-glow-blue blur-3xl" />

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-tv-blue/30 bg-tv-blue/10 px-3 py-1 lens-label font-semibold text-tv-blue">
            <Scale className="h-3 w-3" /> {t('termsPage.badge')}
          </span>
          <h1 className="mt-4 font-heading text-3xl sm:text-4xl font-bold tracking-tight text-tv-text leading-[1.15]">
            {t('termsPage.heroTitle')}
          </h1>
          <p className="mt-3 text-xs text-tv-muted">
            {t('termsPage.lastUpdated', { date: LAST_UPDATED })}
          </p>
          <p className="mt-4 text-sm sm:text-base text-tv-text/90 leading-relaxed max-w-xl">
            {t('termsPage.heroDescription')}
          </p>
        </div>
      </Card>

      <Card className="mt-6 flex flex-col gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-tv-blue/10 text-tv-blue">
          <Target className="h-4 w-4" />
        </span>
        <h2 className="font-heading text-lg font-bold text-tv-text">
          {t('termsPage.summaryTitle')}
        </h2>
        <p className="lens-body-sm text-tv-muted leading-relaxed">
          {t('termsPage.summaryBody')}
        </p>
      </Card>

      <div className="mt-6 flex flex-col gap-4">
        {SECTIONS.map(({ icon: Icon, key }) => (
          <Card key={key} hoverable className="flex flex-col gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-tv-blue/10 text-tv-blue">
              <Icon className="h-4 w-4" />
            </span>
            <h2 className="font-heading text-sm font-bold text-tv-text">
              {t(`termsPage.${key}Title` as const)}
            </h2>
            <p className="lens-body-sm text-tv-muted leading-relaxed">
              {t(`termsPage.${key}Body` as const)}
            </p>
          </Card>
        ))}
      </div>

      <Card className="mt-6 flex flex-col items-start gap-4">
        <a
          href={`mailto:support@sahamlens.id?subject=${encodeURIComponent('Pertanyaan Ketentuan SahamLens')}`}
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-tv-blue/80 bg-tv-blue px-4 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(79,140,255,0.18)] transition-all duration-150 ease-snap hover:bg-tv-blueHover hover:shadow-[0_14px_34px_rgba(79,140,255,0.24)] active:scale-[0.985] sm:w-auto"
        >
          <Mail className="h-4 w-4 shrink-0" /> support@sahamlens.id
        </a>
        <p className="min-w-0 lens-body-sm leading-relaxed text-tv-muted">{t('termsPage.contactNote')}</p>
      </Card>

    </PageContainer>
  );
}
