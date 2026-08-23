'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SiteFooter from '@/components/SiteFooter';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import {
  ArrowUpRight, ArrowDownRight, Sparkles, ArrowRight,
  ShieldCheck, Cpu, Zap, Clock
} from 'lucide-react';

import { Button, Card, Skeleton, EmptyState, LoadingFact } from '@/components/ui';
import { fadeUp, staggerContainer } from '@/lib/motion';
import ThemeToggle from '@/components/ThemeToggle';
import GettingStartedGuide from '@/components/GettingStartedGuide';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import NotificationCenter from '@/components/ui/NotificationCenter';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { useLanguage } from '@/lib/i18n';
import { AI_PICK_UNIVERSE, ACTIVE_LIQUID_UNIVERSE_VERSION } from '@/modules/market/constants/ai-pick-universe';
import { StockSignalRunningText, TickerTape } from '@/components/dashboard/DashboardMarketStrips';
import DashboardFeatureGrid from '@/components/dashboard/DashboardFeatureGrid';
import { useDashboardMarketData, type DashboardMarketDataOptions } from '@/components/dashboard/useDashboardMarketData';
const CommandPalette = dynamic(() => import('@/components/CommandPalette'), { ssr: false });
const ACTIVE_UNIVERSE_COUNT = AI_PICK_UNIVERSE.length;
type DashboardProps = DashboardMarketDataOptions;

export default function Dashboard({ initialIhsg = null, initialRenderedAt, initialLensRadar = null }: DashboardProps) {
  const { t, language } = useLanguage();
  const router = useRouter();
  const [quickSearch, setQuickSearch] = useState('');
  const [guideVisible, setGuideVisible] = useState<boolean | null>(null);
  const [guideOpenRequest, setGuideOpenRequest] = useState(0);

  const handleQuickSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const clean = quickSearch.trim().toUpperCase().replace('.JK', '');
    if (clean) router.push(`/technical/${clean}.JK`);
  };

  const {
    ihsg,
    ihsgFailed,
    tickerFailed,
    tickerItems,
    aiPicks,
    aiPicksUpdatedAt,
    aiPicksNote,
    aiPicksAdvisoryEnabled,
    newsItems,
    loadingNews,
    calendarEvents,
    jakartaDate,
    jakartaTime,
    marketOpen,
  } = useDashboardMarketData({ initialIhsg, initialRenderedAt, initialLensRadar });

  return (
    <div className="min-h-screen bg-tv-bg text-tv-text selection:bg-tv-blue/20">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-tv-surface text-white border-b border-tv-border">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-[64px] items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2.5">
                {/* Logo header halaman depan - `priority` karena ia di atas lipatan dan
                    ikut dinilai sebagai kandidat LCP di mobile. */}
                <Image src="/sahamlens-logo.png" alt="SahamLens" width={32} height={32} priority className="h-8 w-8 rounded-xl object-contain shadow-sm" />
                <span className="font-bold text-[16px] tracking-tight font-heading">SahamLens</span>
              </div>
              <div className="hidden md:flex items-center gap-3 pl-6 border-l border-white/15">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-widest text-white/60 font-semibold">{t('hero.ihsgTitle')}</span>
                  <span className="h-1 w-1 rounded-full bg-tv-green animate-pulse" />
                </div>
                {ihsg ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[18px] font-bold tracking-tight font-number">{ihsg.price.toLocaleString(language === 'id' ? 'id-ID' : 'en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${ihsg.change >= 0 ? 'bg-tv-green/15 text-tv-green' : 'bg-tv-red/15 text-tv-red'}`}>
                      {ihsg.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />} {ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}% ({ihsg.change >= 0 ? '+' : ''}{ihsg.pointChange.toFixed(1)})
                    </span>
                  </div>
                ) : ihsgFailed ? (
                  <span className="text-[12px] font-medium text-white/50">{t('common.noData')}</span>
                ) : (
                  <Skeleton variant="text" className="w-32 h-4" />
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <LanguageSwitcher variant="pill" className="hidden sm:inline-flex" />
              <LanguageSwitcher variant="compact" className="sm:hidden" />
              <ThemeToggle />
              <div className="w-[40px] sm:w-[180px] md:w-[220px]">
                <CommandPalette />
              </div>
              <div className="hidden lg:flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-2.5 py-1">
                <span className={`h-2 w-2 rounded-full animate-pulse ${marketOpen ? 'bg-tv-green' : 'bg-white/30'}`} />
                <span className="text-[11px] font-medium text-white">{marketOpen ? t('common.live') : t('common.closed')}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-medium text-white/50">
                <span className="hidden sm:inline">{jakartaDate && jakartaTime ? `${jakartaDate} • ${jakartaTime}` : t('common.jakartaTime')}</span>
                <span className="sm:hidden">{jakartaTime || t('common.wibTime')}</span>
              </div>
            </div>
          </div>
          {/* mobile IHSG */}
          <div className="flex md:hidden items-center justify-between pb-3 -mt-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">IHSG</span>
              {ihsg ? (
                <>
                  <span className="text-[14px] font-bold font-number">{ihsg.price.toLocaleString(language === 'id' ? 'id-ID' : 'en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  <span className={`text-[11px] font-semibold ${ihsg.change >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}%</span>
                </>
              ) : ihsgFailed ? (
                <span className="text-[12px] text-white/50">{t('common.noData')}</span>
              ) : (
                <Skeleton variant="text" className="w-24 h-3.5" />
              )}
            </div>
            <span className={`text-[10px] flex items-center gap-1 ${marketOpen ? 'text-tv-green' : 'text-white/40'}`}><span className={`h-1.5 w-1.5 rounded-full animate-pulse ${marketOpen ? 'bg-tv-green' : 'bg-white/30'}`} />{marketOpen ? t('common.marketOpen') : t('common.marketClosed')}</span>
          </div>
        </div>
      </header>

      <TickerTape items={tickerItems} failed={tickerFailed} />

      {/* lens-main BUKAN sekadar penamaan. Seluruh aturan mobile/tablet di globals.css
          bergantung padanya: lantai tipografi 9-11px, line-height, touch-action,
          overscroll, min-width:0 anti-overflow, lantai target sentuh 44px. Halaman ini
          - halaman publik yang paling banyak dikunjungi - satu-satunya yang memakai
          <main> polos, jadi ia luput dari semuanya. Itulah sebabnya ia selalu jadi
          halaman terburuk di tiap pengukuran (45 teks di bawah 12px @768 setelah
          halaman lain sudah bersih). */}
      <main className="lens-main mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {/* Marketing Hero - tagline "Lihat Peluang Lebih Jelas." sudah dipakai di
            metadata (app/layout.tsx) tapi belum pernah dirender di halaman manapun.
            Section aditif, tidak mengubah struktur Title Block/ringkasan pasar di
            bawahnya.
            POLISH (2026-08-05, keluhan user "kelihatan kaku"): bg flat bg-tv-card/50
            diganti gradient-accent-soft (biru->ungu, sudah didefinisikan di
            tailwind.config.js) + glow blur dekoratif di belakang icon (glow-purple,
            juga sudah ada di config) - murni CSS, tidak ada konten/data baru. */}
        {/* HERO - dulu pita setipis ~150px berisi judul, satu paragraf, dan sebuah
            gambar, dengan ruang tengah menganga. Ini bagian pertama yang dilihat orang
            dan ia tidak melakukan apa-apa. Sekarang ia membawa angka pasar yang hidup
            dan jalan masuk yang jelas - tanpa satu pun permintaan jaringan baru,
            semuanya dari state yang sudah ada. */}
        {/* `initial={false}`, BUKAN "hidden" - blok ini berisi elemen LCP halaman
            (paragraf di bawah judul hero, dikonfirmasi Lighthouse). Dengan "hidden",
            server mengirimnya terlihat, lalu hidrasi menyetel opacity 0 dan
            menganimasikannya kembali muncul - jadi elemen terbesar halaman baru
            terlukis SETELAH JS diunduh dan dijalankan. Terukur: FCP 1,0 dtk tapi LCP
            4,3 dtk, dengan "element render delay" 1.250 md dan nol waktu unduh sumber
            daya - teks yang sudah ada di HTML, ditahan oleh animasinya sendiri.
            `initial={false}` membuat framer-motion langsung merender keadaan akhir dan
            melewati animasi masuk. Blok di bawah lipatan tetap dianimasika        {/* HERO */}
        <motion.div variants={fadeUp} initial={false} animate="show">
          <Card
            padding="none"
            className="relative overflow-visible mb-6 bg-gradient-accent-soft border border-tv-border/60 px-6 py-8 sm:px-10 sm:py-10 shadow-none"
          >
            {/* Dekorasi tetap terpotong mengikuti kartu, tetapi konten interaktif tidak.
                Sebelumnya overflow-hidden berada di Card sehingga dropdown autocomplete
                hero ikut terpotong dan tampak seolah tidak menghasilkan apa pun. */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
              <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-glow-purple blur-3xl" />
              <div className="absolute -left-24 -bottom-16 h-64 w-64 rounded-full bg-glow-blue blur-3xl" />
            </div>

            <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-stretch">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-tv-blue/30 bg-tv-blue/10 px-3 py-1 text-[11px] font-semibold text-tv-blue">
                  <Sparkles className="h-3 w-3" /> {t('hero.badge')}
                </span>
                <h2 className="mt-3.5 font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-tv-text leading-[1.15]">
                  {t('hero.titleLine1')}<br className="hidden sm:block" /> {t('hero.titleLine2')}
                </h2>
                <p className="mt-3 text-sm sm:text-base text-tv-muted max-w-lg leading-relaxed">
                  {t('hero.description')}
                </p>

                {/* Hero Quick Search Bar */}
                <form onSubmit={handleQuickSearch} className="mt-5 flex items-center gap-2 max-w-lg">
                  <SymbolAutocomplete
                    value={quickSearch}
                    onChange={setQuickSearch}
                    onSelect={(symbol) => router.push(`/technical/${symbol}`)}
                    placeholder={t('common.searchPlaceholder')}
                    showSearchIcon
                    maxSuggestions={5}
                    endAdornment={
                      <kbd className="rounded-md border border-tv-border bg-tv-bg/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-tv-muted shadow-inner">Ctrl K</kbd>
                    }
                    containerClassName="relative flex-1 group"
                    className="w-full pl-10 pr-16 py-3 rounded-2xl bg-tv-card/95 border border-tv-border text-tv-text placeholder:text-tv-muted/70 text-sm font-semibold focus:outline-none focus:border-tv-blue focus:ring-4 focus:ring-tv-blue/15 transition-all shadow-sm"
                    aria-label={t('common.searchPlaceholder')}
                  />
                  <Button
                    type="submit"
                    variant="bare"
                    size="none"
                    className="px-5 py-3 rounded-2xl bg-tv-blue hover:bg-tv-blueHover text-white text-sm font-bold transition-all duration-200 hover:shadow-lg shadow-sm shrink-0 flex items-center gap-2 active:scale-95"
                  >
                    <span>{t('common.search')}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </form>

                {/* Popular Quick Ticker Chips */}
                <div className="mt-3 flex items-center gap-2 flex-wrap text-xs text-tv-muted">
                  <span className="text-xs font-semibold text-tv-muted/90">{t('common.popular')}:</span>
                  {['BBCA', 'BBRI', 'BMRI', 'TLKM', 'ASII', 'BREN'].map((s) => (
                    <Link
                      key={s}
                      href={`/technical/${s}.JK`}
                      className="px-2.5 py-1 rounded-xl bg-tv-card/90 border border-tv-border text-tv-text hover:border-tv-blue/60 hover:bg-tv-blue/10 hover:text-tv-blue text-xs font-bold font-number transition-all duration-150 hover:scale-105 shadow-2xs"
                    >
                      {s}
                    </Link>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link
                    href="/"
                    className="rounded-xl bg-tv-blue px-6 py-3 text-sm font-bold text-white transition-all duration-200 hover:bg-tv-blueHover hover:shadow-lg shadow-sm active:scale-95"
                  >
                    {t('common.startAnalysis')}
                  </Link>
                  <Link
                    href="/breakout-radar"
                    className="rounded-xl border border-tv-border bg-tv-card px-5 py-3 text-sm font-bold text-tv-text transition-all duration-200 hover:border-tv-borderLight hover:bg-tv-cardAlt shadow-sm active:scale-95"
                  >
                    {t('common.openRadar')}
                  </Link>
                  {guideVisible === false && (
                    <Button
                      type="button"
                      variant="bare"
                      size="none"
                      onClick={() => setGuideOpenRequest((current) => current + 1)}
                      className="rounded-xl border border-tv-blue/40 bg-tv-blue/10 px-4 py-3 text-sm font-bold text-tv-blue transition-colors hover:bg-tv-blue/20"
                    >
                      {t('common.startHere')}
                    </Button>
                  )}
                </div>

                <div className="mt-6 rounded-xl border border-tv-border/80 bg-tv-bg/40 px-3.5 py-2.5 text-xs leading-relaxed text-tv-muted max-w-lg">
                  {/* P-1 trust disclaimer: Alat analisis, bukan nasihat investasi */}
                  <span className="font-bold text-tv-text">{t('common.disclaimerShort')}</span>{' '}
                  {t('hero.disclaimerBox')}
                  {' '}<Link href="/disclaimer" className="font-bold text-tv-blue hover:underline">{t('common.disclaimerLink')}</Link>
                </div>
              </div>

              {/* Panel angka hidup - IHSG besar + jumlah emiten terpantau */}
              <div className="flex flex-col justify-between">
                <div className="rounded-2xl border border-tv-border/80 bg-tv-bg/50 p-5 sm:p-6 backdrop-blur-md h-full flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-bold uppercase tracking-wider text-tv-muted flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-tv-green animate-pulse" />
                        {t('hero.ihsgTitle')}
                      </div>
                      <span className="text-[11px] font-semibold text-tv-muted bg-tv-card px-2 py-0.5 rounded-lg border border-tv-border shadow-2xs">
                        {t('hero.ihsgDelay')}
                      </span>
                    </div>
                    {ihsg ? (
                      <>
                        <div className="mt-3 font-number text-3xl sm:text-4xl font-extrabold tracking-tight text-tv-text">
                          {ihsg.price.toLocaleString(language === 'id' ? 'id-ID' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                          ihsg.change >= 0 ? 'bg-tv-green/15 text-tv-green border border-tv-green/30' : 'bg-tv-red/15 text-tv-red border border-tv-red/30'
                        }`}>
                          {ihsg.change >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                          {ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}% ({ihsg.change >= 0 ? '+' : ''}{ihsg.pointChange.toFixed(1)})
                        </div>
                        {ihsg.dataTimestamp && (
                          <div className="mt-2 text-xs font-medium text-tv-muted">
                            Per {new Date(ihsg.dataTimestamp).toLocaleTimeString(language === 'id' ? 'id-ID' : 'en-US', {
                              hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
                            })} WIB
                            {typeof ihsg.ageSeconds === 'number' && ihsg.ageSeconds >= 20 * 60
                              ? ` · ${Math.round(ihsg.ageSeconds / 60)} menit lalu`
                              : ''}
                          </div>
                        )}
                        {ihsgFailed && (
                          <div className="mt-1 text-xs font-medium text-tv-red">
                            {t('common.noData')}
                          </div>
                        )}
                      </>
                    ) : ihsgFailed ? (
                      <p className="mt-2 text-sm text-tv-muted">{t('common.noData')}</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <Skeleton className="h-9 w-40" />
                        <Skeleton variant="text" className="h-5 w-28" />
                      </div>
                    )}
                  </div>

                  <div className="mt-6 pt-5 border-t border-tv-border/80">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="font-number text-xl font-bold text-tv-text">{ACTIVE_UNIVERSE_COUNT}</div>
                        <div className="text-xs font-medium text-tv-muted leading-snug mt-0.5">{t('hero.universeSubtitle')}</div>
                      </div>
                      <div>
                        <div className="font-number text-xl font-bold text-tv-text">
                          {aiPicks === null ? '—' : aiPicks.length}
                        </div>
                        <div className="text-xs font-medium text-tv-muted leading-snug mt-0.5">{t('hero.passedSubtitle')}</div>
                      </div>
                    </div>
                    <p className="mt-3.5 text-xs leading-relaxed text-tv-muted/90">
                      {t('hero.universeDescription', { count: ACTIVE_UNIVERSE_COUNT })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* SIGNAL SAHAM - Langsung di Bawah Hero (Peluang Terkini di Atas Lipatan) */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mb-8"
        >
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-tv-text flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tv-green opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-tv-green" />
                </span>
                {t('radar.title')}
              </h2>
              <p className="mt-1 text-[13px] text-tv-muted max-w-2xl">
                {t('radar.subtitle')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-tv-muted">
                {aiPicksUpdatedAt ? t('radar.updateTime', { time: aiPicksUpdatedAt }) : t('radar.waitingSnapshot')}
              </span>
              <Link
                href="/breakout-radar"
                className="rounded-lg border border-tv-border bg-tv-card px-3 py-1.5 text-[12px] font-semibold text-tv-text transition-colors hover:border-tv-borderLight shadow-sm"
              >
                {t('radar.viewAllRadar')}
              </Link>
            </div>
          </div>

          {aiPicksNote && (
            <p className={`mb-3 text-[11px] rounded-md border px-3 py-2 leading-relaxed ${
              aiPicksAdvisoryEnabled
                ? 'border-tv-border bg-tv-card/60 text-tv-muted'
                : 'border-tv-yellow/30 bg-tv-yellow/10 text-tv-yellow'
            }`}>
              {aiPicksNote}
            </p>
          )}

          {aiPicks === null ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
              </div>
              <LoadingFact />
            </div>
          ) : aiPicks.length === 0 ? (
            <Card>
              <EmptyState
                illustration="search"
                title={t('radar.emptyTitle')}
                description={t('radar.emptyDesc')}
              />
            </Card>
          ) : (
            <StockSignalRunningText items={aiPicks} advisoryEnabled={aiPicksAdvisoryEnabled} />
          )}

          <p className="mt-2 text-[10px] leading-relaxed text-tv-muted">
            {t('radar.footerNote')}
          </p>
        </motion.section>

        {/* TRUST & TRANSPARANSI METRIC STRIP */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
        >
          {[
            {
              icon: Zap,
              title: t('metrics.liquidTitle', { count: ACTIVE_UNIVERSE_COUNT }),
              subtitle: t('metrics.liquidSub'),
              tone: 'text-tv-blue bg-tv-blue/10 border-tv-blue/20',
            },
            {
              icon: Cpu,
              title: t('metrics.rulesTitle'),
              subtitle: t('metrics.rulesSub'),
              tone: 'text-tv-green bg-tv-green/10 border-tv-green/20',
            },
            {
              icon: ShieldCheck,
              title: t('metrics.transparencyTitle'),
              subtitle: t('metrics.transparencySub'),
              tone: 'text-tv-yellow bg-tv-yellow/10 border-tv-yellow/20',
            },
            {
              icon: Clock,
              title: t('metrics.eodTitle'),
              subtitle: t('metrics.eodSub'),
              tone: 'text-tv-purple bg-tv-purple/10 border-tv-purple/20',
            },
          ].map((m, idx) => (
            <Card
              key={idx}
              padding="none" radius="2xl" elevation="none" overflow="visible" highlight={false} className="p-4 border-tv-border flex items-center gap-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-tv-borderLight hover:bg-tv-cardAlt hover:shadow-md"
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${m.tone}`}>
                <m.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="font-heading text-sm font-bold text-tv-text truncate">{m.title}</div>
                <div className="text-xs font-medium text-tv-muted truncate mt-0.5">{m.subtitle}</div>
              </div>
            </Card>
          ))}
        </motion.div>

        <GettingStartedGuide openRequest={guideOpenRequest} onVisibilityChange={setGuideVisible} />

        <DashboardFeatureGrid />

        {/* Berita & Jadwal - dikeluarkan dari dalam kartu chart. */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          <motion.div variants={fadeUp}>
              <Card padding="md" className="h-full">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-heading text-[13px] font-bold text-tv-text">{t('news.title')}</h3>
                  <Link href="/news" className="inline-flex min-h-6 items-center text-[11px] font-bold text-tv-blue transition hover:text-tv-text">{t('news.viewAll')}</Link>
                </div>
                <div className="mt-3 divide-y divide-tv-border/60">
                  {loadingNews ? (
                    <div className="space-y-2.5">
                      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : newsItems.length === 0 ? (
                    <EmptyState
                      illustration="search"
                      title={t('news.emptyTitle')}
                      description={t('news.emptyDesc')}
                    />
                  ) : (
                    newsItems.map((n) => (
                      <a key={n.link || n.title} href={n.link} target="_blank" rel="noopener noreferrer" className="block py-2.5 first:pt-0 last:pb-0 hover:opacity-80 transition-opacity">
                        <p className="text-[12px] font-medium text-tv-text leading-snug line-clamp-2">{n.title}</p>
                        <p className="text-[10px] text-tv-muted mt-1 flex items-center gap-1.5">
                          {n.source}
                          {n.sentiment && (
                            <span className={`lens-chip rounded px-1.5 py-px font-bold ${
                              n.sentiment === 'POSITIF' ? 'bg-tv-green/15 text-tv-green'
                                : n.sentiment === 'NEGATIF' ? 'bg-tv-red/15 text-tv-red'
                                : 'bg-tv-hover text-tv-muted'
                            }`}>{n.sentiment}</span>
                          )}
                        </p>
                      </a>
                    ))
                  )}
                </div>
              </Card>
          </motion.div>

          {/* Jadwal Terdekat - dividen/earnings */}
          <motion.div variants={fadeUp}>
              <Card padding="md" className="h-full">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-heading text-[13px] font-bold text-tv-text">{t('calendar.title')}</h4>
                  <Link href="/calendar" className="inline-flex min-h-6 items-center text-[11px] font-bold text-tv-blue transition hover:text-tv-text">{t('calendar.viewAll')}</Link>
                </div>
                <div className="mt-3">
                  {calendarEvents === null ? (
                    <div className="space-y-2">
                      {[0, 1].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
                    </div>
                  ) : calendarEvents.length === 0 ? (
                    <EmptyState
                      illustration="empty"
                      title={t('calendar.emptyTitle')}
                      description={t('calendar.emptyDesc')}
                    />
                  ) : (
                    <div className="space-y-2">
                      {calendarEvents.map((e, i) => (
                        <Link
                          key={`${e.symbol}-${e.date}-${i}`}
                          href={`/technical/${e.symbol}.JK`}
                          className="flex items-center justify-between gap-2 bg-tv-bg/50 border border-tv-border rounded-md px-3 py-2 hover:border-tv-borderLight transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-number text-[12px] font-bold text-tv-text">{e.symbol}</span>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${e.type === 'DIVIDEND' ? 'bg-tv-green/15 text-tv-green' : 'bg-tv-blue/15 text-tv-blue'}`}>
                                {e.type === 'DIVIDEND' ? t('calendar.dividendType') : t('calendar.earningsType')}
                              </span>
                            </div>
                            <div className="text-[10px] text-tv-muted truncate">{e.title}</div>
                          </div>
                          <span className="text-[11px] text-tv-muted font-number shrink-0">
                            {new Date(e.date).toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' })}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
          </motion.div>
        </motion.div>

        <SiteFooter />
      </main>
    </div>
  );
}
