'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Activity,
  Flame,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Radar,
} from 'lucide-react';
import {
  Card,
  Button,
  CardHeader,
  CardTitle,
  Badge,
  Skeleton,
  EmptyState,
  SegmentedControl,
  PageContainer,
  MetricCard,
  LoadingFact,
  TickerAvatar,
  AnimatedNumber,
  ApiErrorHint,
  SectionHeader,
} from '@/components/ui';
import { fadeUp, staggerContainer } from '@/lib/motion';
import { useLanguage } from '@/lib/i18n';
import { useAuthUser } from '@/lib/hooks/useAuthUser';

import { MarketMoverCard, formatCardItems, type CardDef, type MoverCard } from '@/components/MarketMoverCard';
import { isMarketOpen, getMarketStatus } from '@/lib/utils/market';
import GettingStartedGuide from '@/components/GettingStartedGuide';
import { CrossSymbolChips, MarketBreadthBar, SectorHeatmap } from '@/components/home/MarketPulseVisuals';
import { useHomeWorkspaceData, type NewsInsight, type MarketMover } from '@/components/home/useHomeWorkspaceData';
import HomeCalendarWatchlist from '@/components/home/HomeCalendarWatchlist';
import HomeUpgradePrompt from '@/components/home/HomeUpgradePrompt';
import HomeBrandHero from '@/components/home/HomeBrandHero';
import HomeTodayBrief from '@/components/home/HomeTodayBrief';
import { PRO_UI_ENABLED } from '@/shared/constants/access';


// Jeda antar insight LensConsensus (permintaan user 2026-08-06: 50 detik SEBELUMNYA
// dianggap terlalu cepat berpindah untuk sempat dibaca - satu-satunya konten
// kartu ini sebelumnya cuma satu paragraf statis, tidak pernah berganti sama sekali).
const INSIGHT_ROTATE_MS = 12_000;

const SENTIMENT_BADGE_VARIANT: Record<NewsInsight['sentiment'], 'success' | 'danger' | 'info'> = {
  POSITIF: 'success',
  NEGATIF: 'danger',
  NETRAL: 'info',
};

export default function HomeWorkspace() {
  const { t, dictionary, language } = useLanguage();
  const { user: authUser, resolved: authResolved, effectiveRole } = useAuthUser();
  const {
    ihsg,
    topGainers,
    topLosers,
    topVolume,
    topTechnicalBearish,
    topRsiOversold,
    dailyPicks,
    calendarEvents,
    radarItems,
    loadingRadar,
    radarError,
    radarPreparing,
    radarStale,
    watchlistCount,
    watchlistPreview,
    moversFreshness,
    moversTimeLabel,
    marketError,
    loadingMarket,
    loadingDailyPicks,
    picksNeedPro: rawPicksNeedPro,
    picksLoginRequired,
    aiBriefing,
    newsInsights,
    marketPulse,
    marketPulseNeedPro: rawMarketPulseNeedPro,
    marketPulseLoginRequired,
    marketPulseError,
    loadingMarketPulse,
    supportRequestId,
    fetchMarket,
    fetchMarketPulse,
    fetchRadar,
    topPick,
  } = useHomeWorkspaceData(language);

  // Fitur Pro belum ada (keputusan produk 2026-08-23), jadi keadaan "butuh Pro" tidak
  // boleh pernah dirender - ia menawarkan tingkat berbayar yang tidak bisa dibeli siapa
  // pun. Digerbang DI SUMBERNYA, bukan di tiap tempat pakai: kedua nilai ini dipakai di
  // tiga cabang render sekaligus diteruskan sebagai prop ke komponen anak, jadi
  // menambalnya satu per satu meninggalkan celah.
  //
  // Keadaan "butuh LOGIN" sengaja TIDAK disentuh - itu gembok tamu yang justru harus
  // tetap ada supaya pengunjung mendaftar.
  const picksNeedPro = PRO_UI_ENABLED && rawPicksNeedPro;
  const marketPulseNeedPro = PRO_UI_ENABLED && rawMarketPulseNeedPro;

  const [moversTab, setMoversTab] = useState<'gainer' | 'loser' | 'volume' | 'technicalBearish' | 'rsiOversold'>('gainer');
  const [insightIndex, setInsightIndex] = useState(0);

  const primaryInsight: React.ReactNode | null = aiBriefing ? (
    <p className="text-sm text-tv-text mt-1.5 leading-relaxed">{aiBriefing}</p>
  ) : picksLoginRequired ? (
    <p className="text-sm text-tv-muted mt-1.5">{t('homePage.loginRequired')}</p>
  ) : picksNeedPro ? (
    <p className="text-sm text-tv-muted mt-1.5">{t('homePage.proRequired')}</p>
  ) : topPick ? (
    <p className="text-sm text-tv-text mt-1.5 leading-relaxed">
      {t('homePage.todaySignal')}{' '}
      <span className="font-number font-semibold text-tv-blue">{topPick.symbol.replace('.JK', '')}</span>{' '}
      <Badge variant={topPick.flagged ? 'danger' : 'success'} className="mx-1">
        {topPick.flagged ? topPick.flagReason : t('homePage.strongSignal')}
      </Badge>
      {t('homePage.withScore')}{' '}
      <span className="font-number font-semibold">{topPick.finalScore}/100</span>.
    </p>
  ) : (
    <p className="text-sm text-tv-muted mt-1.5">{t('homePage.noSignalToday')}</p>
  );

  const getSentimentLabel = (s: NewsInsight['sentiment']) => {
    if (language === 'en') {
      return s === 'POSITIF' ? 'Bullish' : s === 'NEGATIF' ? 'Caution' : 'Neutral';
    }
    return s === 'POSITIF' ? 'Positif' : s === 'NEGATIF' ? 'Waspada' : 'Netral';
  };

  // Slot 0 = sinyal harian/ringkasan pasar (logic di atas, tidak berubah). Slot 1+ =
  // berita pasar terbaru. Kosong sampai loadingRadar selesai - jangan ikut
  // dirotasi selagi masih skeleton.
  const insightSlots: React.ReactNode[] = loadingRadar
    ? []
    : [
        primaryInsight,
        ...(newsInsights as NewsInsight[]).map((n, i) => (
          <p key={`news-${i}`} className="text-sm text-tv-text mt-1.5 leading-relaxed">
            <Badge variant={SENTIMENT_BADGE_VARIANT[n.sentiment]} className="mr-1.5 align-middle">
              {getSentimentLabel(n.sentiment)}
            </Badge>
            {n.title}
          </p>
        )),
      ];

  // Ganti insight tiap 12 detik - cukup cepat untuk terasa hidup, tapi masih memberi
  // waktu membaca ringkasan/berita. Tidak jalan
  // kalau cuma 1 slot (tidak ada apa pun untuk dirotasi).
  //
  // BUG FIX (2026-08-14, laporan pengguna - dot penanda "tidak bisa digeser manual,
  // harus nunggu sendiri"): auto-rotate SEKARANG lewat ref (autoRotateTick di bawah),
  // bukan langsung setInterval permanen - supaya navigasi manual (klik dot/swipe) bisa
  // MEMULAI ULANG hitungan 12 detiknya, bukan diam-diam ketimpa auto-rotate sesaat
  // setelah pengguna baru saja pindah manual.
  const autoRotateTick = useRef<() => void>(() => {});
  autoRotateTick.current = () => setInsightIndex((i) => i + 1);
  const restartAutoRotateRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (insightSlots.length <= 1) return;
    let t: ReturnType<typeof setInterval>;
    const start = () => {
      clearInterval(t);
      t = setInterval(() => {
        if (!document.hidden) autoRotateTick.current();
      }, INSIGHT_ROTATE_MS);
    };
    restartAutoRotateRef.current = start;
    start();
    return () => clearInterval(t);
  }, [insightSlots.length]);

  const activeInsightIndex = insightSlots.length
    ? ((insightIndex % insightSlots.length) + insightSlots.length) % insightSlots.length
    : 0;

  // Navigasi manual - dot diklik ATAU swipe (lihat handler sentuh di bawah). Timer
  // auto-rotate direstart supaya tidak langsung ganti lagi tiba-tiba begitu pengguna
  // baru saja memilih slide-nya sendiri.
  const goToInsight = useCallback((index: number) => {
    setInsightIndex(index);
    restartAutoRotateRef.current();
  }, []);
  const stepInsight = useCallback((delta: number) => {
    setInsightIndex((i) => i + delta);
    restartAutoRotateRef.current();
  }, []);

  const touchStartX = useRef<number | null>(null);
  const SWIPE_THRESHOLD_PX = 40;
  const handleInsightTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const handleInsightTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null || insightSlots.length <= 1) return;
    const deltaX = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;
    // Geser ke kiri (deltaX negatif) = maju ke insight berikutnya, sama seperti pola
    // carousel umum (konten "ditarik" ke arah gerakan jari).
    stepInsight(deltaX < 0 ? 1 : -1);
  };

  return (
    <PageContainer className="min-h-full flex flex-col space-y-10 p-4 md:p-6 lg:p-7">
      {/* Canonical home hero: brand promise + direct stock search + live IHSG.
          Uses the workspace market snapshot below, so restoring the brand proposition
          adds no extra network request or competing home route. */}
      <HomeBrandHero ihsg={ihsg} loadingMarket={loadingMarket} marketError={marketError} />

      <ApiErrorHint requestId={supportRequestId} className="justify-end" />

      <HomeTodayBrief
        ihsg={ihsg}
        marketPulse={marketPulse}
        dailyPicks={dailyPicks}
        radarItems={radarItems}
        topLosers={topLosers}
        loadingMarket={loadingMarket}
        loadingMarketPulse={loadingMarketPulse}
        loadingRadar={loadingRadar}
        picksLoginRequired={picksLoginRequired}
        picksNeedPro={picksNeedPro}
        marketPulseLoginRequired={marketPulseLoginRequired}
        marketPulseNeedPro={marketPulseNeedPro}
        radarStale={radarStale}
      />

      {/* First-run guidance stays available, but no longer interrupts the brand →
          market-context path on every fresh session. */}
      <GettingStartedGuide />

      {/* Detail pasar: evidence layer setelah ringkasan "Hari ini" di atas.
          Pengguna mendapat konteks + peluang + risiko lebih dulu, baru drill-down. */}
      {/* Market Pulse - sector strength + breadth dari /api/market-pulse (Pro-gated,
          sama seperti gerbang Today's Opportunities di bawah - user non-Pro/anon lihat
          upsell, bukan data kosong). IHSG dicabut dari sini (redundan - sudah tampil
          terus-menerus di TopMarketBar global sejak Phase 1). */}
      <motion.section initial="hidden" animate="show" variants={fadeUp} className="space-y-4">
        <SectionHeader
          eyebrow="Pasar"
          title="Kondisi Pasar"
          action={<Link href="/market-pulse" className="lens-label text-tv-blue hover:underline">Lihat semua</Link>}
        />
          {marketPulseLoginRequired ? (
            <EmptyState title="Login untuk melihat kondisi pasar" description="Sector & breadth butuh akun." />
          ) : marketPulseNeedPro ? (
            <EmptyState title="Fitur Pro" description="Upgrade ke Pro untuk melihat sector strength & market breadth." />
          ) : marketPulseError ? (
            <EmptyState title="Data pasar sementara tidak tersedia." action={{ label: 'Coba lagi', onClick: fetchMarketPulse }} />
          ) : loadingMarketPulse ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
              <LoadingFact />
            </div>
          ) : !marketPulse ? (
            <EmptyState title="Data pasar sementara tidak tersedia." action={{ label: 'Coba lagi', onClick: fetchMarketPulse }} />
          ) : (
            <div className="space-y-3">
              <MarketBreadthBar breadth={marketPulse.breadth} />
              <SectorHeatmap sectors={marketPulse.sectorHeatmap} />
              <p className="lens-meta leading-relaxed text-tv-muted/80">
                Heatmap menampilkan 11 sektor IDX berbasis sampel saham representatif per sektor, bukan seluruh emiten.
              </p>
            </div>
          )}

          {/* Persilangan MA20/MA50 - dulu kartu terpisah dengan judul dan tautannya
              sendiri. Dilebur ke sini (audit tata letak 2026-08-13) karena keduanya
              menjawab satu pertanyaan yang sama: "pasar hari ini bagaimana". Dua judul
              sejajar membuat pembaca mengira ini dua topik berbeda.

              Sumber datanya TETAP beda - dailyPicks, bukan marketPulse - jadi gerbang
              loading/kosongnya berdiri sendiri di dalam blok ini dan tidak ikut gerbang
              Pro milik breadth/heatmap di atas. */}
          <div className="mt-4 border-t border-tv-border pt-4">
            <div className="mb-2.5 flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-tv-blue" />
              <h4 className="lens-meta font-bold uppercase tracking-wider text-tv-muted">Persilangan Rata-rata Bergerak</h4>
            </div>
            {loadingDailyPicks ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
              <LoadingFact />
            </div>
          ) : !dailyPicks ? (
            <EmptyState illustration="empty" title="Data insight sementara tidak tersedia" description="Hitungan Golden/Dead Cross diperbarui tiap sesi perdagangan." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <MetricCard
                    label="Golden Cross"
                    value={dailyPicks.goldenCross.count}
                    tone="positive"
                    suffix="saham"
                    hint={dailyPicks.goldenCross.stale ? 'Data sesi terakhir' : 'MA20 memotong MA50 dari bawah hari ini'}
                  />
                  <CrossSymbolChips symbols={dailyPicks.goldenCross.items} tone="positive" />
                </div>
                <div className="space-y-2">
                  <MetricCard
                    label="Dead Cross"
                    value={dailyPicks.deadCross.count}
                    tone="negative"
                    suffix="saham"
                    hint={dailyPicks.deadCross.stale ? 'Data sesi terakhir' : 'MA20 memotong MA50 dari atas hari ini'}
                  />
                  <CrossSymbolChips symbols={dailyPicks.deadCross.items} tone="negative" />
                </div>
              </div>
              {/* Storytelling: dua angka mentah tidak memberi tahu apa pun sampai
                  dibandingkan satu sama lain. */}
              <p className="mt-3 lens-meta leading-relaxed text-tv-muted">
                {(() => {
                  const g = dailyPicks.goldenCross.count;
                  const d = dailyPicks.deadCross.count;
                  if (g === 0 && d === 0) return 'Tidak ada persilangan MA20/MA50 hari ini - tren jangka menengah sedang tidak berubah arah.';
                  if (g > d * 1.5) return `Persilangan naik ${g} berbanding ${d} turun - momentum jangka menengah condong ke atas, tapi persilangan MA adalah sinyal telat: ia mengkonfirmasi tren yang sudah jalan, bukan memprediksinya.`;
                  if (d > g * 1.5) return `Persilangan turun ${d} berbanding ${g} naik - lebih banyak saham kehilangan tren jangka menengahnya. Persilangan MA mengkonfirmasi tren yang sudah jalan, bukan memprediksinya.`;
                  return `Berimbang: ${g} persilangan naik dan ${d} turun. Tidak ada arah jangka menengah yang dominan hari ini.`;
                })()}
              </p>
            </>
            )}
          </div>
      </motion.section>

      {/* Peluang Hari Ini - SATU kartu, dulu DUA ("Peluang Teratas" + "Kandidat
          Berikutnya"). Penggabungan ini bukan sekadar kosmetik: keduanya membaca
          array `radarItems` YANG SAMA - hero memakai [0], daftar memakai slice(1,6) -
          jadi kartu terpisah memaksa lima cabang gerbang yang identik ditulis dua kali
          (loading, belum login, belum Pro, error, kosong). Satu sumber data, satu
          gerbang. Kalau nanti gerbangnya berubah, tidak ada lagi salinan kedua yang
          bisa lupa ikut diubah.

          Badge Delayed/Data-Sesi-Terakhir naik ke CardHeader supaya statusnya terbaca
          sebelum angkanya, bukan terselip di dalam badan kartu. */}
      <motion.section variants={fadeUp} initial="hidden" animate="show" className="space-y-4">
        <SectionHeader
          eyebrow="LensRadar"
          title="Peluang Hari Ini"
          action={(
            <div className="flex items-center gap-2">
              {radarStale || !isMarketOpen() ? (
                <Badge variant="neutral" dot>Data Sesi Terakhir</Badge>
              ) : (
                <Badge variant="danger" dot title="Data Yahoo Finance, delay ±15 menit dari kondisi pasar riil - bukan realtime">Delayed</Badge>
              )}
              <Link href="/breakout-radar" className="lens-label text-tv-blue hover:underline">Lihat semua</Link>
            </div>
          )}
        />

          {loadingRadar ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton variant="circle" className="h-12 w-12" />
                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" className="w-32" />
                  <Skeleton variant="text" className="w-20" />
                </div>
                <Skeleton className="h-10 w-16" />
              </div>
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              <LoadingFact />
            </div>
          ) : picksLoginRequired ? (
            <EmptyState title="Login untuk melihat peluang hari ini" description="Sinyal harian butuh akun." />
          ) : picksNeedPro ? (
            <EmptyState title="Fitur Pro" description="Upgrade ke Pro untuk melihat peluang hari ini." />
          ) : radarError ? (
            <EmptyState title="Data pasar sementara tidak tersedia." action={{ label: 'Coba lagi', onClick: fetchRadar }} />
          ) : radarPreparing ? (
            <EmptyState illustration="collecting" title="Pemindaian hari ini sedang disiapkan" description="Snapshot LensRadar belum tersedia. Ini bukan berarti tidak ada saham yang lolos; coba muat ulang beberapa saat lagi." action={{ label: 'Muat ulang', onClick: fetchRadar }} />
          ) : !radarItems[0] ? (
            /* Phase 0 (P0-1/P0-3): daftar bisa kosong karena saham berstatus 'DATA TIDAK
               CUKUP' dan yang tidak lolos gerbang kelayakan DIKELUARKAN, bukan diberi
               peringkat rendah. Deskripsinya menyebut sebabnya, bukan cuma "coba lagi". */
            <EmptyState title="Belum ada peluang kuat hari ini" description="Tidak ada saham yang lolos ambang kualitas + kelengkapan data hari ini. Saham berdata tidak lengkap atau berlikuiditas sangat rendah sengaja tidak ditampilkan." />
          ) : (() => {
            const hero = radarItems[0];
            return (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <TickerAvatar symbol={hero.symbol} size="lg" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-number text-2xl font-bold text-white">{hero.symbol.replace('.JK', '')}</span>
                        {hero.flagged ? (
                          <Badge variant="danger">{hero.flagReason}</Badge>
                        ) : (
                          <Badge variant="success">Sinyal Kuat</Badge>
                        )}
                      </div>
                      <div className={`font-number text-sm mt-1 ${hero.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                        Rp {Math.round(hero.price).toLocaleString('id-ID')} ({hero.changePct >= 0 ? '+' : ''}{hero.changePct.toFixed(2)}%)
                      </div>
                    </div>
                  </div>
                  {/* Skala + kelengkapan data dinyatakan eksplisit (audit skor 2026-08-05):
                      angka telanjang dulu terbaca "x dari 100" padahal skalanya 0-140, dan
                      coverage (porsi bobot yang benar-benar punya data) tidak pernah tampil
                      meski sudah lama dihitung. */}
                  <div className="text-right">
                    <div className="lens-meta text-tv-muted uppercase tracking-wide">LensScore</div>
                    <div className="font-number text-3xl font-bold text-tv-blue">
                      <AnimatedNumber value={hero.finalScore} format={(n) => String(Math.round(n))} />
                      <span className="text-sm font-normal text-tv-muted">/100</span>
                    </div>
                    {typeof hero.coverage === 'number' && (
                      <div className="lens-meta text-tv-muted">data {hero.coverage}%</div>
                    )}
                  </div>
                </div>
                {(hero.topReasons?.length ?? 0) > 0 && (
                  <ul className="text-xs text-tv-muted space-y-1">
                    {hero.topReasons!.slice(0, 3).map((r, i) => <li key={i}>• {r}</li>)}
                  </ul>
                )}
                <div className="flex gap-2 pt-1">
                  <Link href={`/technical/${hero.symbol}`} className="px-3 py-1.5 rounded-md bg-tv-blue hover:bg-tv-blueHover text-white text-xs font-semibold transition-colors">
                    Buka Analisis
                  </Link>
                  <Button variant="bare" size="none"
                    onClick={() => window.dispatchEvent(new Event('open-ai-chat'))}
                    className="px-3 py-1.5 rounded-md bg-tv-blue/10 hover:bg-tv-blue/20 text-tv-blue text-xs font-semibold transition-colors"
                  >
                    Ask LensAI
                  </Button>
                </div>
                {/* Kandidat berikutnya - slice(1,6), sengaja mulai dari indeks 1 supaya
                    saham hero tidak muncul dua kali. Dulu ini kartu sendiri; sekarang
                    lanjutan dari daftar yang sama, dipisah garis, bukan judul baru. */}
                {radarItems.length > 1 && (
                  <div className="mt-1 border-t border-tv-border pt-3">
                    <div className="mb-2.5 flex items-center gap-2">
                      <Radar className="h-3.5 w-3.5 text-tv-purple" />
                      <h4 className="lens-meta font-bold uppercase tracking-wider text-tv-muted">Kandidat Berikutnya</h4>
                    </div>
                <div className="space-y-2">
                  {radarItems.slice(1, 6).map((it) => (
                    <motion.div key={it.symbol} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.995 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
                      <Link
                        href={`/technical/${it.symbol}`}
                        className={`flex items-center gap-3 bg-tv-bg/50 border-y border-r border-tv-border rounded-md px-3 py-2.5 hover:border-tv-borderLight hover:bg-tv-hover/40 transition-colors border-l-4 ${it.flagged ? 'border-l-tv-warning' : 'border-l-tv-green'}`}
                      >
                        <TickerAvatar symbol={it.symbol} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-number text-sm font-bold text-white">{it.symbol.replace('.JK', '')}</span>
                            <span className={`lens-meta font-number ${it.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                              {it.changePct >= 0 ? '+' : ''}{it.changePct.toFixed(2)}%
                            </span>
                          </div>
                          {it.flagged && <span className="text-tv-red lens-meta">! {it.flagReason}</span>}
                          {/* Sebelumnya baris ini jatuh ke '-' polos saat topReasons kosong -
                              user tidak bisa membedakan "tidak ada alasan" dari "alasannya
                              gagal dimuat". Sekarang kekosongannya dinamai. */}
                          <div className="lens-meta text-tv-muted truncate">
                            {it.topReasons?.[0] ?? (it.signals?.[0] || 'Lolos ambang skor, rincian alasan belum tersedia')}
                          </div>
                        </div>
                        {/* Bar skor: posisi relatif terhadap 100 langsung terbaca tanpa
                            membandingkan angka satu per satu antar baris. */}
                        <div className="text-right shrink-0 w-20">
                          <div className="font-number text-sm font-semibold text-white">
                            {it.finalScore}<span className="lens-meta font-normal text-tv-muted">/100</span>
                          </div>
                          <div className="mt-1 h-1 w-full rounded-full bg-tv-hover overflow-hidden">
                            <div
                              className={`h-full rounded-full ${it.flagged ? 'bg-tv-warning' : 'bg-tv-green'}`}
                              style={{ width: `${Math.min(100, Math.max(0, it.finalScore))}%` }}
                            />
                          </div>
                          <div className="lens-meta text-tv-muted font-number mt-1">Rp {Math.round(it.price).toLocaleString('id-ID')}</div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
                  </div>
                )}
              </div>
            );
          })()}
      </motion.section>

      {/* Market Movers - dulu 3 card grid (Gainer/Loser/Volume) sekaligus, sekarang
          1 card ber-tab (spec BUILD 001: kurangi section panjang dengan tabs) -
          MarketMoverCard & formatCardItems tidak berubah, cuma dipilih satu per waktu. */}
      {(() => {
        type MoversTabKey = 'gainer' | 'loser' | 'volume' | 'technicalBearish' | 'rsiOversold';
        const isEn = language === 'en';
        const MOVERS_DEFS: Record<MoversTabKey, CardDef> = {
          gainer: {
            id: 'gainer',
            title: isEn ? 'Stocks with Highest Daily Gain' : 'Saham dengan Kenaikan Tertinggi',
            sub: 'Top Gainer',
            accent: 'green',
            Icon: TrendingUp,
            key: 'gainer',
            listPath: '/market/top-gainer',
          },
          loser: {
            id: 'loser',
            title: isEn ? 'Stocks with Deepest Daily Decline' : 'Saham dengan Penurunan Terdalam',
            sub: 'Top Loser',
            accent: 'red',
            Icon: TrendingDown,
            key: 'loser',
            listPath: '/market/top-loser',
          },
          volume: {
            id: 'volume',
            title: isEn ? 'Ranked by Trading Volume' : 'Berdasarkan Volume Lembar Saham',
            sub: isEn ? 'Top Volume • Shares' : 'Top Volume • Lot',
            accent: 'slate',
            Icon: BarChart3,
            key: 'volume',
            listPath: '/market/top-volume',
          },
          technicalBearish: {
            id: 'technicalBearish',
            title: isEn ? 'Bearish Technical Signals (MA20 < MA50)' : 'Sinyal Teknikal Bearish (MA20 < MA50)',
            sub: 'Technical Signal',
            accent: 'red',
            Icon: TrendingDown,
            key: 'technicalBearish',
            listPath: '/market/technical-bearish',
          },
          rsiOversold: {
            id: 'rsiOversold',
            title: isEn ? 'Lowest Daily RSI (14)' : 'RSI (14) Terendah Hari Ini',
            sub: isEn ? 'Oversold candidates - inspect RSI level' : 'Kandidat jenuh jual - cek nilai RSI-nya',
            accent: 'warning',
            Icon: Activity,
            key: 'rsiOversold',
            listPath: '/market/rsi-oversold',
          },
        };
        const SOURCE_DATA: Record<MoversTabKey, MarketMover[]> = {
          gainer: topGainers,
          loser: topLosers,
          volume: topVolume,
          technicalBearish: topTechnicalBearish,
          rsiOversold: topRsiOversold,
        };
        const activeCard: MoverCard = { ...MOVERS_DEFS[moversTab], items: formatCardItems(moversTab, SOURCE_DATA[moversTab]) };
        return (
          <motion.div initial="hidden" animate="show" variants={fadeUp} className="space-y-3">
            {marketError ? (
                <EmptyState title={isEn ? 'Market data temporarily unavailable.' : 'Data pasar sementara tidak tersedia.'} action={{ label: isEn ? 'Retry' : 'Coba lagi', onClick: fetchMarket }} />
            ) : (
              <>
                <SegmentedControl
                  layoutId="home-movers-tab"
                  value={moversTab}
                  onChange={(v) => setMoversTab(v as MoversTabKey)}
                  options={[
                    { label: t('homePage.tabGainer'), value: 'gainer' },
                    { label: t('homePage.tabLoser'), value: 'loser' },
                    { label: t('homePage.tabVolume'), value: 'volume' },
                    { label: t('homePage.tabBearish'), value: 'technicalBearish' },
                    { label: t('homePage.tabRsiOversold'), value: 'rsiOversold' },
                  ]}
                />
                <MarketMoverCard card={activeCard} lastUpdated={moversTimeLabel} loaded={!loadingMarket} />
              </>
            )}
          </motion.div>
        );
      })()}

      {/* AI Insight - hero */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <Card variant="default" padding="lg" surface="40" className="border-tv-border/80 shadow-none">
          <div className="flex items-start gap-3 md:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-tv-blue/20 bg-tv-blue/10">
              <Sparkles className="h-4 w-4 text-tv-blue" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-sm font-semibold text-white">{t('homePage.lensConsensusTitle')}</h3>
                <Badge variant="info" dot title={t('homePage.lensConsensusLiveTooltip')}>{t('common.live')}</Badge>
              </div>
              {loadingRadar ? (
                <div className="mt-1.5 space-y-1.5">
                  <Skeleton variant="text" className="w-full max-w-md" />
                  <Skeleton variant="text" className="w-2/3 max-w-xs" />
                </div>
              ) : (
                <div onTouchStart={handleInsightTouchStart} onTouchEnd={handleInsightTouchEnd} className="touch-pan-y">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeInsightIndex}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.35 }}
                    >
                      {insightSlots[activeInsightIndex]}
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}
              {!loadingRadar && insightSlots.length > 1 && (
                <div className="flex items-center gap-1.5 mt-2.5">
                  {insightSlots.map((_, i) => (
                    <Button variant="bare" size="none"
                      key={i}
                      type="button"
                      onClick={() => goToInsight(i)}
                      aria-label={t('homePage.viewSlideAria', { index: i + 1, total: insightSlots.length })}
                      aria-current={i === activeInsightIndex}
                      className="flex h-4 items-center px-0.5 -my-1.5"
                    >
                      <span
                        className={`h-1 rounded-full transition-all duration-300 ${
                          i === activeInsightIndex ? 'w-5 bg-tv-blue' : 'w-1 bg-white/15'
                        }`}
                      />
                    </Button>
                  ))}
                </div>
              )}
              <p className="mt-2 lens-meta text-tv-muted">
                {language === 'en' ? 'Source: Yahoo Finance, delay ±15 min' : 'Sumber: Yahoo Finance, delay ±15 menit'}
              </p>
            </div>
          </div>
        </Card>
      </motion.div>

      <HomeCalendarWatchlist
        calendarEvents={calendarEvents}
        watchlistCount={watchlistCount}
        watchlistPreview={watchlistPreview}
      />

      <HomeUpgradePrompt shouldOffer={authResolved && Boolean(authUser) && effectiveRole === 'guest'} />
    </PageContainer>
  );
}
