'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, BarChart3, CheckCircle2, Filter, History, LineChart, Target, Waves } from 'lucide-react';

import { Card } from '@/components/ui';
import { fadeUp } from '@/lib/motion';
import { useLanguage } from '@/lib/i18n';

type FeatureCardLinkProps = {
  href: string;
  radius?: '2xl' | '3xl';
  className?: string;
  linkClassName?: string;
  children: React.ReactNode;
};

function FeatureCardLink({ href, radius = '2xl', className = '', linkClassName = '', children }: FeatureCardLinkProps) {
  return (
    <Card
      as="article"
      padding="none"
      radius={radius}
      elevation="none"
      highlight={false}
      className={`group border-tv-border shadow-1 ${className}`}
    >
      <Link href={href} className={`flex h-full w-full ${linkClassName}`}>
        {children}
      </Link>
    </Card>
  );
}

export default function DashboardFeatureGrid() {
  const { t } = useLanguage();

  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="mb-8"
    >
      <div className="mb-5 flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wider text-tv-blue">{t('bento.tag')}</span>
        <h2 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-tv-text">{t('bento.title')}</h2>
        <p className="max-w-3xl text-sm sm:text-base leading-relaxed text-tv-muted">
          {t('bento.subtitle')}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {/* Tile 1 (Large - Featured): LensConsensus & Teknikal Pro */}
        <FeatureCardLink
          href="/dashboard"
          radius="3xl"
          className="lg:col-span-2 transition-all duration-200 hover:-translate-y-1 hover:border-tv-blue/40 hover:bg-tv-cardAlt hover:shadow-xl"
          linkClassName="flex-col justify-between p-6 sm:p-7"
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border text-tv-blue bg-tv-blue/10 border-tv-blue/30 shadow-xs">
                  <LineChart className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-tv-blue">{t('bento.featuredBadge')}</span>
                  <h3 className="font-heading text-xl font-bold text-tv-text">{t('bento.technicalTitle')}</h3>
                </div>
              </div>
              <span className="hidden sm:inline-flex px-3 py-1 rounded-full text-xs font-bold bg-tv-blue/15 text-tv-blue border border-tv-blue/30 shadow-2xs">
                {t('bento.consensusBadge')}
              </span>
            </div>
            <p className="text-sm sm:text-[14.5px] leading-relaxed text-tv-muted/90 max-w-xl">
              {t('bento.technicalDesc')}
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-tv-border/70 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-tv-muted">
              <CheckCircle2 className="h-4 w-4 text-tv-green" />
              <span>{t('bento.technicalRuleBadge')}</span>
            </div>
            <span className="inline-flex text-xs sm:text-sm font-bold text-tv-blue transition-colors group-hover:text-tv-text flex items-center gap-1.5">
              {t('bento.technicalAction')} <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </FeatureCardLink>

        {/* Tile 2: Moat Proxy & Fundamental Sehat */}
        <FeatureCardLink
          href="/fundamental"
          radius="3xl"
          className="transition-all duration-200 hover:-translate-y-1 hover:border-tv-green/40 hover:bg-tv-cardAlt hover:shadow-xl"
          linkClassName="flex-col justify-between p-6 sm:p-7"
        >
          <div>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border text-tv-green bg-tv-green/10 border-tv-green/30 shadow-xs">
              <Target className="h-5 w-5" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-tv-green">{t('bento.qualityBadge')}</span>
            <h3 className="font-heading text-xl font-bold text-tv-text mt-0.5">{t('bento.fundamentalTitle')}</h3>
            <p className="mt-2 text-sm sm:text-[14.5px] leading-relaxed text-tv-muted/90">
              {t('bento.fundamentalDesc')}
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-tv-border/70 flex items-center justify-between">
            <span className="inline-flex text-xs sm:text-sm font-bold text-tv-green transition-colors group-hover:text-tv-text flex items-center gap-1.5">
              {t('bento.fundamentalAction')} <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </FeatureCardLink>

        {/* Tile 3: LensScanner & Breakout Radar */}
        <FeatureCardLink
          href="/screener"
          radius="3xl"
          className="transition-all duration-200 hover:-translate-y-1 hover:border-tv-purple/40 hover:bg-tv-cardAlt hover:shadow-xl"
          linkClassName="flex-col justify-between p-6"
        >
          <div>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border text-tv-purple bg-tv-purple/10 border-tv-purple/30 shadow-xs">
              <Filter className="h-5 w-5" />
            </div>
            <h4 className="font-heading text-lg font-bold text-tv-text">{t('bento.screenerTitle')}</h4>
            <p className="mt-2 text-sm leading-relaxed text-tv-muted/90">
              {t('bento.screenerDesc')}
            </p>
          </div>
          <span className="mt-5 inline-flex text-xs sm:text-sm font-bold text-tv-purple transition-colors group-hover:text-tv-text flex items-center gap-1.5">
            {t('bento.screenerAction')} <ArrowRight className="h-4 w-4" />
          </span>
        </FeatureCardLink>

        {/* Tile 4: Backtest Transparan */}
        <FeatureCardLink
          href="/backtest"
          className="transition-all duration-200 hover:-translate-y-0.5 hover:border-tv-borderLight hover:bg-tv-cardAlt"
          linkClassName="flex-col justify-between p-5"
        >
          <div>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border text-tv-yellow bg-tv-yellow/10 border-tv-yellow/20">
              <History className="h-5 w-5" />
            </div>
            <h4 className="font-heading text-base font-bold text-tv-text">{t('bento.backtestTitle')}</h4>
            <p className="mt-1.5 text-sm leading-relaxed text-tv-muted sm:text-[13px]">
              {t('bento.backtestDesc')}
            </p>
          </div>
          <span className="mt-4 inline-flex text-xs font-bold text-tv-yellow transition-colors group-hover:text-tv-text flex items-center gap-1">
            {t('bento.backtestAction')} <ArrowRight className="h-3 w-3" />
          </span>
        </FeatureCardLink>

        {/* Tile 5: Earnings Monitor & Dividen */}
        <FeatureCardLink
          href="/dividend"
          className="transition-all duration-200 hover:-translate-y-0.5 hover:border-tv-borderLight hover:bg-tv-cardAlt"
          linkClassName="flex-col justify-between p-5"
        >
          <div>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border text-tv-green bg-tv-green/10 border-tv-green/20">
              <BarChart3 className="h-5 w-5" />
            </div>
            <h4 className="font-heading text-base font-bold text-tv-text">{t('bento.dividendTitle')}</h4>
            <p className="mt-1.5 text-sm leading-relaxed text-tv-muted sm:text-[13px]">
              {t('bento.dividendDesc')}
            </p>
          </div>
          <span className="mt-4 inline-flex text-xs font-bold text-tv-green transition-colors group-hover:text-tv-text flex items-center gap-1">
            {t('bento.dividendAction')} <ArrowRight className="h-3 w-3" />
          </span>
        </FeatureCardLink>

        {/* Tile 6 (Full Width on lg): Dashboard Makro & Sektor */}
        <FeatureCardLink
          href="/macro"
          className="lg:col-span-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-tv-borderLight hover:bg-tv-cardAlt"
          linkClassName="flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6"
        >
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-tv-purple bg-tv-purple/10 border-tv-purple/20 mt-0.5">
              <Waves className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-heading text-base font-bold text-tv-text">{t('bento.macroTitle')}</h4>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-tv-purple/15 text-tv-purple border border-tv-purple/30">
                  {t('bento.macroBadge')}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-tv-muted max-w-3xl">
                {t('bento.macroDesc')}
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 text-xs font-bold text-tv-purple transition-colors group-hover:text-tv-text items-center gap-1">
            {t('bento.macroAction')} <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </FeatureCardLink>
      </div>
    </motion.section>
  );
}
