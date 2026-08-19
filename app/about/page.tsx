'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Eye, Grid3x3, ZoomIn } from 'lucide-react';
import { Card, PageContainer } from '@/components/ui';
import { useLanguage } from '@/lib/i18n';

export default function AboutPage() {
  const { t } = useLanguage();

  const pillars = [
    {
      icon: Eye,
      title: t('aboutPage.pillar1Title'),
      body: t('aboutPage.pillar1Body'),
    },
    {
      icon: Grid3x3,
      title: t('aboutPage.pillar2Title'),
      body: t('aboutPage.pillar2Body'),
    },
    {
      icon: ZoomIn,
      title: t('aboutPage.pillar3Title'),
      body: t('aboutPage.pillar3Body'),
    },
  ];

  return (
    <PageContainer className="p-4 md:p-6 max-w-3xl">
      <Link
        href="/"
        className="mb-6 inline-flex min-h-6 items-center gap-1.5 text-sm text-tv-muted transition-colors hover:text-tv-text"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('aboutPage.backToHome')}
      </Link>

      <Card
        padding="none"
        className="relative overflow-hidden bg-gradient-accent-soft border border-tv-border/60 px-6 py-10 sm:px-10 sm:py-12 shadow-none"
      >
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-glow-purple blur-3xl" />
        <div className="pointer-events-none absolute -left-24 -bottom-16 h-64 w-64 rounded-full bg-glow-blue blur-3xl" />

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-tv-blue/30 bg-tv-blue/10 px-3 py-1 text-[11px] font-semibold text-tv-blue">
            <Sparkles className="h-3 w-3" /> {t('aboutPage.badge')}
          </span>
          <h1 className="mt-4 font-heading text-3xl sm:text-4xl font-bold tracking-tight text-tv-text leading-[1.15] whitespace-pre-line">
            {t('aboutPage.heroTitle')}
          </h1>
          <p className="mt-5 text-sm sm:text-base text-tv-text/90 leading-relaxed max-w-xl">
            {t('aboutPage.heroDescription')}
          </p>
        </div>
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {pillars.map(({ icon: Icon, title, body }) => (
          <Card key={title} hoverable className="flex flex-col gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-tv-blue/10 text-tv-blue">
              <Icon className="h-4 w-4" />
            </span>
            <h2 className="font-heading text-sm font-bold text-tv-text">{title}</h2>
            <p className="text-[13px] text-tv-muted leading-relaxed">{body}</p>
          </Card>
        ))}
      </div>

      <p className="mt-8 text-[11px] text-tv-muted leading-relaxed">
        {t('aboutPage.disclaimer')}
      </p>
    </PageContainer>
  );
}
