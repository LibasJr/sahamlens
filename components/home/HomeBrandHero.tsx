'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUpRight, ArrowDownRight, Search, ShieldCheck } from 'lucide-react';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { Button, Card, Skeleton } from '@/components/ui';
import { useLanguage } from '@/lib/i18n';
import { technicalResearchPath } from '@/shared/navigation/technical-route';

interface HomeBrandHeroProps {
  ihsg: { price: number; changePct: number } | null;
  ihsgAsOfLabel?: string | null;
  loadingMarket: boolean;
  marketError: boolean;
}

const POPULAR_SYMBOLS = ['BBCA', 'BBRI', 'BMRI', 'TLKM'];

export default function HomeBrandHero({ ihsg, ihsgAsOfLabel, loadingMarket, marketError }: HomeBrandHeroProps) {
  const router = useRouter();
  const { t, language } = useLanguage();
  const [query, setQuery] = useState('');

  const openSymbol = (symbol: string) => {
    const clean = symbol.trim().toUpperCase().replace(/\.JK$/i, '');
    if (clean) router.push(technicalResearchPath(`${clean}.JK`));
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
      overflow="visible"
      className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-tv-surface via-tv-card to-tv-base p-5 sm:p-7 shadow-[0_12px_40px_rgba(0,0,0,0.4)] pb-6 pt-5 sm:pb-7 sm:pt-6 mb-2"
    >
      {/* Glow ambient background */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-tv-blue/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />

      <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(270px,0.55fr)] lg:items-center">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-tv-blue/30 bg-tv-blue/10 text-xs font-semibold text-tv-blue tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-tv-blue animate-pulse" aria-hidden="true" />
            SahamLens • Super-App Riset IDX
          </div>

          <h1 className="mt-3.5 max-w-3xl text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white font-heading leading-tight">
            {t('hero.titleLine1')}{' '}
            <span className="bg-gradient-to-r from-tv-blue via-blue-400 to-indigo-300 bg-clip-text text-transparent">
              {t('hero.titleLine2')}
            </span>
          </h1>

          <p className="mt-2.5 max-w-2xl text-xs sm:text-sm text-tv-muted leading-relaxed">
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
              className="h-12 w-full rounded-2xl border border-white/[0.12] bg-white/[0.04] pl-10 pr-3 text-sm font-semibold text-white placeholder:text-tv-muted/70 outline-none backdrop-blur-md transition focus:border-tv-blue focus:ring-4 focus:ring-tv-blue/15"
              aria-label={t('common.searchPlaceholder')}
            />
            <Button type="submit" size="none" className="h-12 shrink-0 rounded-2xl px-5 bg-tv-blue hover:bg-tv-blueHover text-white font-bold transition-all shadow-md active:scale-95">
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

        <div className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-tv-surface/80 p-5 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <span className="lens-meta font-bold uppercase tracking-[0.12em] text-white/70">{t('hero.ihsgTitle')}</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs font-medium text-white/80">
              <span className={`h-1.5 w-1.5 rounded-full ${positive ? 'bg-tv-green animate-pulse' : 'bg-tv-red animate-pulse'}`} />
              {ihsgAsOfLabel || 'Live IDX'}
            </span>
          </div>

          {ihsg ? (
            <>
              <div className="mt-2 font-number text-3xl font-extrabold tracking-tight text-white">
                {ihsg.price.toLocaleString(language === 'id' ? 'id-ID' : 'en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className={`mt-1.5 inline-flex items-center gap-1 font-number text-sm font-bold px-2 py-0.5 rounded-lg ${
                positive ? 'bg-tv-green/15 text-tv-green' : 'bg-tv-red/15 text-tv-red'
              }`}>
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

          <div className="mt-4 flex items-start gap-2 border-t border-white/[0.06] pt-3 text-xs leading-relaxed text-tv-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-tv-blue" aria-hidden="true" />
            <p><span className="font-semibold text-white">{t('common.disclaimerShort')}</span> {t('hero.disclaimerBox')}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
