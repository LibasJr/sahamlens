'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUpRight, ArrowDownRight, Sparkles } from 'lucide-react';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { Button, Card, Skeleton } from '@/components/ui';
import { useLanguage } from '@/lib/i18n';

interface HomeBrandHeroProps {
  ihsg: { price: number; changePct: number } | null;
  loadingMarket: boolean;
  marketError: boolean;
}

const POPULAR_SYMBOLS = ['BBCA', 'BBRI', 'BMRI', 'TLKM'];

export default function HomeBrandHero({ ihsg, loadingMarket, marketError }: HomeBrandHeroProps) {
  const router = useRouter();
  const { t, language } = useLanguage();
  const [query, setQuery] = useState('');

  const openSymbol = (symbol: string) => {
    const clean = symbol.trim().toUpperCase().replace(/\.JK$/i, '');
    if (clean) router.push(`/technical/${clean}.JK`);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    openSymbol(query);
  };

  const positive = (ihsg?.changePct ?? 0) >= 0;

  return (
    <Card
      as="section"
      padding="none"
      className="relative overflow-hidden border-tv-border/70 bg-gradient-accent-soft px-5 py-6 shadow-none sm:px-7 sm:py-7 lg:px-8 lg:py-8"
    >
      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-glow-purple blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-glow-blue blur-3xl" />

      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.75fr)] lg:items-stretch">
        <div className="min-w-0">
          <span className="lens-meta inline-flex items-center gap-1.5 rounded-full border border-tv-blue/30 bg-tv-blue/10 px-3 py-1 font-semibold text-tv-blue">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t('hero.badge')}
          </span>

          <h1 className="lens-hero-title mt-3.5 max-w-3xl text-tv-text">
            {t('hero.titleLine1')}{' '}
            <span className="text-tv-blue">{t('hero.titleLine2')}</span>
          </h1>

          <p className="lens-body mt-3 max-w-2xl text-tv-muted">
            {t('hero.description')}
          </p>

          <form onSubmit={onSubmit} className="mt-5 flex max-w-2xl items-stretch gap-2">
            <SymbolAutocomplete
              value={query}
              onChange={setQuery}
              onSelect={openSymbol}
              placeholder={t('common.searchPlaceholder')}
              showSearchIcon
              maxSuggestions={5}
              containerClassName="relative min-w-0 flex-1"
              className="h-12 w-full rounded-xl border border-tv-border bg-tv-bg/75 pl-10 pr-3 text-sm font-semibold text-tv-text shadow-sm outline-none transition focus:border-tv-blue focus:ring-4 focus:ring-tv-blue/10"
              aria-label={t('common.searchPlaceholder')}
            />
            <Button
              type="submit"
              size="none"
              className="h-12 shrink-0 rounded-xl px-4 sm:px-5"
            >
              <span className="hidden sm:inline">{t('common.search')}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="lens-meta font-semibold text-tv-muted">{t('common.popular')}:</span>
            {POPULAR_SYMBOLS.map((symbol) => (
              <Link
                key={symbol}
                href={`/technical/${symbol}.JK`}
                className="lens-meta rounded-lg border border-tv-border bg-tv-card/75 px-2.5 py-1.5 font-number font-bold text-tv-text transition hover:border-tv-blue/50 hover:bg-tv-blue/10 hover:text-tv-blue"
              >
                {symbol}
              </Link>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              href="/screener"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-tv-blue px-4 text-sm font-bold text-white transition hover:bg-tv-blueHover"
            >
              {t('common.startAnalysis')}
            </Link>
            <Link
              href="/breakout-radar"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-tv-border bg-tv-card/70 px-4 text-sm font-bold text-tv-text transition hover:border-tv-borderLight hover:bg-tv-cardAlt"
            >
              {t('common.openRadar')}
            </Link>
          </div>
        </div>

        <div className="flex min-h-[178px] flex-col justify-between rounded-2xl border border-tv-border/80 bg-tv-bg/55 p-5 backdrop-blur-sm">
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="lens-meta font-bold uppercase tracking-[0.12em] text-tv-muted">{t('hero.ihsgTitle')}</span>
              <span className="lens-meta rounded-lg border border-tv-border bg-tv-card/80 px-2 py-1 font-semibold text-tv-muted">
                {t('hero.ihsgDelay')}
              </span>
            </div>

            {ihsg ? (
              <>
                <div className="mt-4 font-number text-3xl font-extrabold tracking-tight text-tv-text sm:text-4xl">
                  {ihsg.price.toLocaleString(language === 'id' ? 'id-ID' : 'en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div
                  className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                    positive
                      ? 'border border-tv-green/30 bg-tv-green/10 text-tv-green'
                      : 'border border-tv-red/30 bg-tv-red/10 text-tv-red'
                  }`}
                >
                  {positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  {positive ? '+' : ''}{ihsg.changePct.toFixed(2)}%
                </div>
              </>
            ) : loadingMarket ? (
              <div className="mt-4 space-y-3">
                <Skeleton className="h-10 w-40" />
                <Skeleton variant="text" className="h-5 w-24" />
              </div>
            ) : (
              <p className="mt-4 text-sm text-tv-muted">
                {marketError ? t('common.noData') : '—'}
              </p>
            )}
          </div>

          <p className="mt-5 border-t border-tv-border/70 pt-4 text-xs leading-relaxed text-tv-muted">
            <span className="font-bold text-tv-text">{t('common.disclaimerShort')}</span>{' '}
            {t('hero.disclaimerBox')}
          </p>
        </div>
      </div>
    </Card>
  );
}
