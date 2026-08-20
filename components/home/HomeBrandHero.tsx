'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUpRight, ArrowDownRight, Search, ShieldCheck } from 'lucide-react';
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
      variant="flat"
      padding="none"
      className="border-b border-tv-border/70 bg-transparent pb-6 pt-2 sm:pb-7 sm:pt-3 lg:pb-8"
    >
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(250px,0.55fr)] lg:items-end">
        <div className="min-w-0">
          <div className="lens-meta inline-flex items-center gap-2 font-bold uppercase tracking-[0.16em] text-tv-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-tv-blue" aria-hidden="true" />
            SahamLens · Beta Research Workspace
          </div>

          <h1 className="lens-hero-title mt-3 max-w-3xl text-tv-text">
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
              className="h-12 w-full rounded-xl border border-tv-border bg-tv-surface/80 pl-10 pr-3 text-sm font-semibold text-tv-text outline-none transition focus:border-tv-blue/70 focus:ring-2 focus:ring-tv-blue/10"
              aria-label={t('common.searchPlaceholder')}
            />
            <Button type="submit" size="none" className="h-12 shrink-0 rounded-xl px-4 sm:px-5">
              <Search className="h-4 w-4 sm:hidden" aria-hidden="true" />
              <span className="hidden sm:inline">{t('common.search')}</span>
              <ArrowRight className="hidden h-4 w-4 sm:block" aria-hidden="true" />
            </Button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="lens-meta font-semibold text-tv-muted">{t('common.popular')}:</span>
            {POPULAR_SYMBOLS.map((symbol) => (
              <Link
                key={symbol}
                href={`/technical/${symbol}.JK`}
                className="lens-meta font-number font-bold text-tv-muted transition hover:text-tv-blue"
              >
                {symbol}
              </Link>
            ))}
            <span className="hidden h-3 w-px bg-tv-border sm:block" aria-hidden="true" />
            <Link href="/screener" className="lens-meta font-semibold text-tv-blue hover:underline">Screener</Link>
            <Link href="/breakout-radar" className="lens-meta font-semibold text-tv-blue hover:underline">LensRadar</Link>
          </div>
        </div>

        <div className="border-l-0 border-tv-border/70 lg:border-l lg:pl-6">
          <div className="flex items-center justify-between gap-3">
            <span className="lens-meta font-bold uppercase tracking-[0.12em] text-tv-muted">{t('hero.ihsgTitle')}</span>
            <span className="lens-meta font-medium text-tv-muted">{t('hero.ihsgDelay')}</span>
          </div>

          {ihsg ? (
            <>
              <div className="mt-2 font-number text-3xl font-extrabold tracking-tight text-tv-text">
                {ihsg.price.toLocaleString(language === 'id' ? 'id-ID' : 'en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className={`mt-1.5 inline-flex items-center gap-1 font-number text-sm font-bold ${positive ? 'text-tv-green' : 'text-tv-red'}`}>
                {positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                {positive ? '+' : ''}{ihsg.changePct.toFixed(2)}%
              </div>
            </>
          ) : loadingMarket ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-9 w-36" />
              <Skeleton variant="text" className="h-4 w-20" />
            </div>
          ) : (
            <p className="mt-3 text-sm text-tv-muted">{marketError ? t('common.noData') : '—'}</p>
          )}

          <div className="mt-4 flex items-start gap-2 border-t border-tv-border/60 pt-3 text-xs leading-relaxed text-tv-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-tv-green" aria-hidden="true" />
            <p><span className="font-semibold text-tv-text">{t('common.disclaimerShort')}</span> {t('hero.disclaimerBox')}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
