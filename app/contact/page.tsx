'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, Clock, ShieldCheck, FileText } from 'lucide-react';
import { Card, PageContainer } from '@/components/ui';
import { useLanguage } from '@/lib/i18n';

export default function ContactPage() {
  const { t } = useLanguage();

  const reportItems = [
    t('contactPage.reportItems.account'),
    t('contactPage.reportItems.page'),
    t('contactPage.reportItems.device'),
    t('contactPage.reportItems.steps'),
    t('contactPage.reportItems.time'),
    t('contactPage.reportItems.error'),
    t('contactPage.reportItems.ticker'),
  ];

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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-tv-blue/30 bg-tv-blue/10 px-3 py-1 text-[11px] font-semibold text-tv-blue">
            <Mail className="h-3 w-3" /> {t('contactPage.badge')}
          </span>
          <h1 className="mt-4 font-heading text-3xl sm:text-4xl font-bold tracking-tight text-tv-text leading-[1.15]">
            {t('contactPage.heroTitle')}
          </h1>
          <p className="mt-5 text-sm sm:text-base text-tv-text/90 leading-relaxed max-w-xl">
            {t('contactPage.heroDescription')}
          </p>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
            <a
              href={t('contactPage.ctaHref')}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-tv-blue/80 bg-tv-blue px-4 font-semibold text-white shadow-[0_10px_28px_rgba(79,140,255,0.18)] transition-all duration-150 ease-snap hover:bg-tv-blueHover hover:shadow-[0_14px_34px_rgba(79,140,255,0.24)] active:scale-[0.985]"
            >
              {t('contactPage.ctaLabel')}
            </a>
            <div className="flex flex-col gap-1 text-[12px] text-tv-muted">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> {t('contactPage.responseTarget')}
              </span>
              <span>{t('contactPage.serviceHours')}</span>
              <span>{t('contactPage.serviceNote')}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card hoverable className="flex flex-col gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-tv-blue/10 text-tv-blue">
            <FileText className="h-4 w-4" />
          </span>
          <h2 className="font-heading text-sm font-bold text-tv-text">{t('contactPage.reportTitle')}</h2>
          <p className="text-[13px] text-tv-muted leading-relaxed">{t('contactPage.reportIntro')}</p>
          <ul className="flex flex-col gap-1.5 text-[13px] text-tv-muted">
            {reportItems.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-tv-blue" />
                {item}
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-col gap-4">
          <Card hoverable className="flex flex-col gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-tv-red/10 text-tv-red">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <h2 className="font-heading text-sm font-bold text-tv-text">{t('contactPage.securityTitle')}</h2>
            <p className="text-[13px] text-tv-muted leading-relaxed">
              {t('contactPage.securityWarning')}
            </p>
          </Card>

          <Card hoverable className="flex flex-col gap-3">
            <h2 className="font-heading text-sm font-bold text-tv-text">{t('contactPage.channelTitle')}</h2>
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-tv-text">{t('contactPage.channelEmail')}</span>
              <a
                href={t('contactPage.ctaHref')}
                className="text-[13px] text-tv-blue hover:underline break-all"
              >
                support@sahamlens.id
              </a>
              <span className="text-[12px] text-tv-muted">{t('contactPage.channelEmailDesc')}</span>
            </div>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
