'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Activity,
  Menu,
  Flame,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Radar,
  Filter,
  Eye,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Skeleton, EmptyState, SegmentedControl, PageContainer } from '@/components/ui';
import { fadeUp, staggerContainer } from '@/lib/motion';
import PromoUpgradeModal from '@/components/PromoUpgradeModal';
import PaywallModal from '@/components/PaywallModal';
import { PRICING_PLANS, FULL_FEATURE_LIST, formatRupiah, type PricingPlan } from '@/shared/config/pricing';
import { MarketMoverCard, formatCardItems, type CardDef, type MoverCard } from '@/components/MarketMoverCard';

interface MarketMover {
  symbol: string;
  changePct: number;
  price: number;
  volume?: number;
  score?: number;
}

interface DailyPickCounts {
  attractive: { count: number };
  breakout: { count: number };
  undervalue: { count: number };
  foreignAccumulation: { count: number };
}

const PROMO_STORAGE_KEY = 'sahamlens_promo_last_seen';

function todayJakarta(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function markPromoSeenToday() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROMO_STORAGE_KEY, todayJakarta());
}

function hasSeenPromoToday(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(PROMO_STORAGE_KEY) === todayJakarta();
}

export default function HomePage() {
  const [ihsg, setIhsg] = useState<{ price: number; changePct: number } | null>(null);
  const [topGainers, setTopGainers] = useState<MarketMover[]>([]);
  const [topLosers, setTopLosers] = useState<MarketMover[]>([]);
  const [topVolume, setTopVolume] = useState<MarketMover[]>([]);
  const [topTechnical, setTopTechnical] = useState<MarketMover[]>([]);
  const [topTechnicalBearish, setTopTechnicalBearish] = useState<MarketMover[]>([]);
  const [topRsiOversold, setTopRsiOversold] = useState<MarketMover[]>([]);
  const [dailyPicks, setDailyPicks] = useState<DailyPickCounts | null>(null);
  // Menggantikan tampilan widget "Hari Ini AI Menemukan" (dailyPicks-nya sendiri TETAP
  // di-fetch di atas - masih dipakai payload /api/ai-briefing) - jadwal Corporate
  // Calendar terdekat belum ada baik di halaman ini maupun landing page "/".
  const [calendarEvents, setCalendarEvents] = useState<
    { date: string; symbol: string; type: 'DIVIDEND' | 'EARNINGS'; title: string }[] | null
  >(null);
  const [radarItems, setRadarItems] = useState<
    { symbol: string; price: number; changePct: number; finalScore: number; topReasons?: string[]; flagged: boolean; flagReason: string | null }[]
  >([]);
  const [loadingRadar, setLoadingRadar] = useState(true);
  const [radarError, setRadarError] = useState(false);
  const [radarStale, setRadarStale] = useState(false);
  const [moversTab, setMoversTab] = useState<'gainer' | 'loser' | 'volume' | 'technicalBearish' | 'rsiOversold'>('gainer');
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null);
  const [watchlistPreview, setWatchlistPreview] = useState<{ symbol: string }[]>([]);

  const [ihsgFreshness, setIhsgFreshness] = useState<string | null>(null);
  const [ihsgTimeLabel, setIhsgTimeLabel] = useState<string | null>(null);
  const [moversFreshness, setMoversFreshness] = useState<string | null>(null);
  const [moversTimeLabel, setMoversTimeLabel] = useState<string | null>(null);

  const [marketError, setMarketError] = useState(false);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [loadingDailyPicks, setLoadingDailyPicks] = useState(true);
  const [picksNeedPro, setPicksNeedPro] = useState(false);
  const [picksLoginRequired, setPicksLoginRequired] = useState(false);
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoPlan, setPromoPlan] = useState<PricingPlan['id']>('1m');
  const [showPaywallFromPromo, setShowPaywallFromPromo] = useState(false);

  const fetchMarket = useCallback(() => {
    setLoadingMarket(true);
    setMarketError(false);
    // Ringkasan pasar (IHSG + top gainer/loser) - publik, tanpa gerbang Pro, jadi
    // Beranda tidak lagi menampilkan teaser upgrade untuk sekadar lihat kondisi pasar.
    Promise.all([
      fetch('/api/live/^JKSE', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/market-summary', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([liveJkse, summary]) => {
        if (!liveJkse && !summary) { setMarketError(true); return; }
        if (liveJkse) {
          setIhsg({ price: liveJkse.price, changePct: liveJkse.changePercent });
          setIhsgFreshness(liveJkse.freshness ?? null);
          setIhsgTimeLabel(liveJkse.lastUpdate ? new Date(liveJkse.lastUpdate).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB' : null);
        }
        if (summary) {
          setTopGainers((summary.topGainers || []).slice(0, 10));
          setTopLosers((summary.topLosers || []).slice(0, 10));
          setTopVolume((summary.topVolume || []).slice(0, 10));
          setTopTechnical((summary.topTechnical || []).slice(0, 10));
          setTopTechnicalBearish((summary.topTechnicalBearish || []).slice(0, 10));
          setTopRsiOversold((summary.topRsiOversold || []).slice(0, 10));
          setMoversFreshness(summary._meta?.freshness ?? null);
          setMoversTimeLabel(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB');
        }
      })
      .finally(() => setLoadingMarket(false));
  }, []);

  const [marketPulse, setMarketPulse] = useState<{
    sectorHeatmap: { sector: string; color: string; changePct: number }[];
    breadth: { advancing: number; declining: number; total: number };
  } | null>(null);
  const [marketPulseNeedPro, setMarketPulseNeedPro] = useState(false);
  const [marketPulseLoginRequired, setMarketPulseLoginRequired] = useState(false);
  const [marketPulseError, setMarketPulseError] = useState(false);
  const [loadingMarketPulse, setLoadingMarketPulse] = useState(true);

  const fetchMarketPulse = useCallback(() => {
    setLoadingMarketPulse(true);
    setMarketPulseError(false);
    fetch('/api/market-pulse', { cache: 'no-store' })
      .then((r) => {
        if (r.status === 401) { setMarketPulseLoginRequired(true); return null; }
        if (r.status === 402) { setMarketPulseNeedPro(true); return null; }
        if (!r.ok) { setMarketPulseError(true); return null; }
        return r.json();
      })
      .then((d) => {
        if (d) setMarketPulse({ sectorHeatmap: d.sectorHeatmap, breadth: d.breadth });
      })
      .catch(() => setMarketPulseError(true))
      .finally(() => setLoadingMarketPulse(false));
  }, []);

  useEffect(() => {
    fetchMarket();
    fetchMarketPulse();

    // "Hari Ini AI Menemukan" - publik (sama seperti widget di landing page /),
    // dipakai ulang di sini supaya Beranda terisi info pasar, bukan sekadar kosong
    // setelah Portfolio & Market Pulse dilepas dari halaman ini.
    fetch('/api/daily-picks', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setDailyPicks(d); })
      .catch(() => {})
      .finally(() => setLoadingDailyPicks(false));

    // Jadwal Corporate Calendar terdekat (Dividen/Earnings) - respons endpoint berbentuk
    // { events: Record<'YYYY-MM-DD', CalendarEvent[]> }, diratakan dan diurutkan di sini
    // supaya widget cukup ambil 5 teratas.
    fetch('/api/calendar', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const map = d?.events as Record<string, { symbol: string; type: 'DIVIDEND' | 'EARNINGS'; title: string }[]> | undefined;
        if (!map) { setCalendarEvents([]); return; }
        const today = todayJakarta();
        const flat = Object.entries(map)
          .filter(([date]) => date >= today)
          .flatMap(([date, events]) => events.map((e) => ({ date, ...e })))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 5);
        setCalendarEvents(flat);
      })
      .catch(() => setCalendarEvents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRadar = useCallback(() => {
    setLoadingRadar(true);
    setRadarError(false);
    fetch('/api/ai-pick', { cache: 'no-store' })
      .then((r) => {
        if (r.status === 401) { setPicksLoginRequired(true); return null; }
        if (r.status === 402) { setPicksNeedPro(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d) => {
        if (!d) return;
        if (d.error || d.ready === false) { setRadarItems([]); return; }
        setRadarItems(d.items || []);
        setRadarStale(!!d.stale);
      })
      .catch(() => setRadarError(true))
      .finally(() => setLoadingRadar(false));
  }, []);

  useEffect(() => {
    fetchRadar();
  }, [fetchRadar]);

  useEffect(() => {
    fetch('/api/watchlist', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = d?.data || [];
        setWatchlistCount(list.length);
        setWatchlistPreview(list.slice(0, 3));
      })
      .catch(() => setWatchlistCount(null));
  }, []);

  useEffect(() => {
    fetch('/api/user/profile', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((profile) => {
        if (profile && !profile.hasProAccess && !hasSeenPromoToday()) {
          setShowPromoModal(true);
        }
      })
      .catch(() => {});
  }, []);

  const topPick = radarItems[0];

  const handleClosePromo = useCallback(() => {
    markPromoSeenToday();
    setShowPromoModal(false);
  }, []);

  const handleSelectPlan = useCallback((planId: PricingPlan['id']) => {
    markPromoSeenToday();
    setPromoPlan(planId);
    setShowPromoModal(false);
    setShowPaywallFromPromo(true);
  }, []);

  // AI Experience: setelah semua data pasar siap, minta Gemini merangkai satu
  // paragraf naratif (bukan sekadar gabungan angka) - gagal diam-diam ke pesan
  // rule-based di bawah kalau API/GEMINI_API_KEY tidak tersedia. Murni ringkasan
  // pasar (bukan akun) - lihat catatan di app/api/ai-briefing/route.ts.
  useEffect(() => {
    if (loadingMarket || loadingRadar || loadingDailyPicks || aiBriefing) return;
    fetch('/api/ai-briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topPick: topPick ? {
          ticker: topPick.symbol.replace('.JK', ''),
          consensus: topPick.flagged ? topPick.flagReason : 'STRONG BUY',
          confidence: topPick.finalScore,
        } : null,
        indices: ihsg ? [{ name: 'IHSG', changePct: ihsg.changePct }] : [],
        pickCounts: dailyPicks ? {
          attractive: dailyPicks.attractive.count,
          breakout: dailyPicks.breakout.count,
          undervalue: dailyPicks.undervalue.count,
        } : undefined,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.briefing) setAiBriefing(d.briefing); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMarket, loadingRadar, loadingDailyPicks]);

  return (
    <PageContainer className="p-4 md:p-6 space-y-5 min-h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
            className="md:hidden p-2 -ml-2 text-tv-muted hover:text-white rounded-lg hover:bg-white/5"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-heading text-xl font-bold text-white">Beranda</h1>
            <p className="text-xs text-tv-muted mt-0.5">Ringkasan pasar & sinyal AI hari ini</p>
          </div>
        </div>
      </div>

      {/* AI Insight - hero */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <Card variant="default" padding="lg" className="border-tv-blue/30 shadow-2">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-tv-blue flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-sm font-semibold text-white">LensAI</h2>
                <Badge variant="info" dot>Live</Badge>
              </div>
              {loadingRadar ? (
                <div className="mt-1.5 space-y-1.5">
                  <Skeleton variant="text" className="w-full max-w-md" />
                  <Skeleton variant="text" className="w-2/3 max-w-xs" />
                </div>
              ) : aiBriefing ? (
                <p className="text-sm text-tv-text mt-1.5 leading-relaxed">{aiBriefing}</p>
              ) : picksLoginRequired ? (
                <p className="text-sm text-tv-muted mt-1.5">Login untuk melihat sinyal AI harian.</p>
              ) : picksNeedPro ? (
                <p className="text-sm text-tv-muted mt-1.5">Upgrade ke Pro untuk melihat sinyal AI harian.</p>
              ) : topPick ? (
                <p className="text-sm text-tv-text mt-1.5 leading-relaxed">
                  Sinyal AI hari ini: <span className="font-number font-semibold text-tv-blue">{topPick.symbol.replace('.JK', '')}</span>{' '}
                  <Badge variant={topPick.flagged ? 'danger' : 'success'} className="mx-1">
                    {topPick.flagged ? topPick.flagReason : 'STRONG BUY'}
                  </Badge>
                  dengan confidence <span className="font-number font-semibold">{topPick.finalScore}%</span>.
                </p>
              ) : (
                <p className="text-sm text-tv-muted mt-1.5">Belum ada sinyal kuat hari ini. Cek Stock Recommendations untuk detail lengkap.</p>
              )}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Market Pulse - sector strength + breadth dari /api/market-pulse (Pro-gated,
          sama seperti gerbang Today's Opportunities di bawah - user non-Pro/anon lihat
          upsell, bukan data kosong). IHSG dicabut dari sini (redundan - sudah tampil
          terus-menerus di TopMarketBar global sejak Phase 1). */}
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <Card hoverable>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-tv-purple" />
              <CardTitle>LensMarket</CardTitle>
            </div>
            <Link href="/market-pulse" className="text-[11px] text-tv-blue hover:underline">LensMarket</Link>
          </CardHeader>
          {marketPulseLoginRequired ? (
            <EmptyState title="Login untuk melihat LensMarket" description="Sector & breadth butuh akun." />
          ) : marketPulseNeedPro ? (
            <EmptyState title="Fitur Pro" description="Upgrade ke Pro untuk melihat sector strength & market breadth." />
          ) : marketPulseError ? (
            <EmptyState title="Data pasar sementara tidak tersedia." action={{ label: 'Coba lagi', onClick: fetchMarketPulse }} />
          ) : loadingMarketPulse ? (
            <div className="bg-tv-bg/50 border border-tv-border rounded-md p-2.5 space-y-2">
              <Skeleton variant="text" className="w-24" />
              <Skeleton className="h-6 w-40" />
            </div>
          ) : !marketPulse ? (
            <EmptyState title="Data pasar sementara tidak tersedia." action={{ label: 'Coba lagi', onClick: fetchMarketPulse }} />
          ) : (
            <div className="space-y-2">
              <div className="bg-tv-bg/50 border border-tv-border rounded-md p-2.5">
                <div className="text-[10px] text-tv-muted uppercase tracking-wide">Market Breadth</div>
                <div className="text-sm text-white mt-1">
                  <span className="font-number font-semibold text-tv-green">{marketPulse.breadth.advancing} naik</span>
                  {' • '}
                  <span className="font-number font-semibold text-tv-red">{marketPulse.breadth.declining} turun</span>
                  {' '}dari {marketPulse.breadth.total} saham
                </div>
              </div>
              <div className="space-y-1.5">
                {marketPulse.sectorHeatmap.slice(0, 3).map((s) => (
                  <div key={s.sector} className="flex items-center justify-between bg-tv-bg/50 border border-tv-border rounded-md px-2.5 py-1.5">
                    <span className="text-xs text-white">{s.sector}</span>
                    <span className={`text-xs font-number font-semibold ${s.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                      {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Hero Opportunity - item #1 dari /api/ai-pick (sama sumber data dengan
          LensRadar di bawahnya; radarItems[0] di sini vs radarItems.slice(1,6) di
          LensRadar supaya tidak ada saham yang tampil dobel). */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <Card variant="default" padding="lg" className="border-tv-blue/30 shadow-2">
          {loadingRadar ? (
            <Skeleton className="h-24 w-full" />
          ) : picksLoginRequired ? (
            <EmptyState title="Login untuk melihat Today's Opportunities" description="Sinyal AI harian butuh akun." />
          ) : picksNeedPro ? (
            <EmptyState title="Fitur Pro" description="Upgrade ke Pro untuk melihat Today's Opportunities." />
          ) : radarError ? (
            <EmptyState title="Data pasar sementara tidak tersedia." action={{ label: 'Coba lagi', onClick: fetchRadar }} />
          ) : !radarItems[0] ? (
            <EmptyState title="Belum ada peluang kuat hari ini" description="Coba cek lagi nanti setelah jam bursa berjalan." />
          ) : (() => {
            const hero = radarItems[0];
            return (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-tv-gold" />
                    <CardTitle>Today&apos;s Opportunities</CardTitle>
                  </div>
                  {radarStale ? <Badge variant="neutral" dot>Data Sesi Terakhir</Badge> : <Badge variant="danger" dot>Live</Badge>}
                </div>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
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
                  <div className="text-right">
                    <div className="text-[10px] text-tv-muted uppercase tracking-wide">LensScore</div>
                    <div className="font-number text-3xl font-bold text-tv-blue">{hero.finalScore}</div>
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
                  <button
                    onClick={() => window.dispatchEvent(new Event('open-ai-chat'))}
                    className="px-3 py-1.5 rounded-md bg-tv-blue/10 hover:bg-tv-blue/20 text-tv-blue text-xs font-semibold transition-colors"
                  >
                    Ask LensAI
                  </button>
                </div>
              </div>
            );
          })()}
        </Card>
      </motion.div>

      {/* Jadwal Terdekat & LensRadar sejajar 1 baris - dua-duanya card isi-list yang
          tinggi, jadi align lebih rapi dibanding sebelumnya dipasangkan dengan
          LensMarket yang pendek. */}
      <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Jadwal Corporate Calendar terdekat - menggantikan "Hari Ini AI Menemukan"
            yang isinya sama persis dengan widget "Rekomendasi AI Hari Ini" di landing
            page "/" (duplikat). Cakupan cuma Dividen & Earnings - Yahoo Finance tidak
            punya data RUPS/Stock Split IDX yang bisa diandalkan (lihat komentar di
            corporate-calendar.service.ts). */}
        <motion.div variants={fadeUp}>
          <Card hoverable>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-tv-gold" />
                <CardTitle>Jadwal Terdekat</CardTitle>
              </div>
              <Link href="/calendar" className="text-[11px] text-tv-blue hover:underline">Lihat Semua</Link>
            </CardHeader>
            {calendarEvents === null ? (
              <div className="space-y-2">
                {[0, 1].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : calendarEvents.length === 0 ? (
              <p className="text-xs text-tv-muted py-4 text-center">Belum ada jadwal dalam waktu dekat.</p>
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
                        <span className="font-number text-sm font-bold text-white">{e.symbol}</span>
                        <Badge variant={e.type === 'DIVIDEND' ? 'success' : 'info'}>
                          {e.type === 'DIVIDEND' ? 'Dividen' : 'Earnings'}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-tv-muted truncate">{e.title}</div>
                    </div>
                    <span className="text-[11px] text-tv-muted font-number shrink-0">
                      {new Date(e.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* LensRadar - dulu "Sinyal Teknikal Bullish" generik (MA20>MA50), sekarang
            LensRadar Live sungguhan (skor komposit + alasan) dari /api/ai-pick, sama
            sumber data dengan app/breakout-radar/page.tsx. Tidak ada status EARLY/
            WATCH/BREAKOUT dst - backend tidak menghitung itu, lihat audit spec. */}
        <Card hoverable>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-tv-purple" />
              <CardTitle>LensRadar</CardTitle>
            </div>
            <Link href="/breakout-radar" className="text-[11px] text-tv-blue hover:underline">Lihat Semua</Link>
          </CardHeader>
          {loadingRadar ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : radarError ? (
            <EmptyState
              title="Data pasar sementara tidak tersedia."
              action={{ label: 'Coba lagi', onClick: fetchRadar }}
            />
          ) : radarItems.length === 0 ? (
            <EmptyState title="Belum ada sinyal kuat hari ini." description="Cek LensRadar Live untuk daftar lengkap." />
          ) : (
            <div className="space-y-2">
              {radarItems.map((it) => (
                <Link
                  key={it.symbol}
                  href={`/technical/${it.symbol}`}
                  className={`flex items-center justify-between gap-2 bg-tv-bg/50 border-y border-r border-tv-border rounded-md px-3 py-2 hover:border-tv-borderLight transition-colors border-l-4 ${it.flagged ? 'border-l-tv-warning' : 'border-l-tv-green'}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-number text-sm font-bold text-white">{it.symbol.replace('.JK', '')}</span>
                      <span className={`text-[11px] font-number ${it.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                        {it.changePct >= 0 ? '+' : ''}{it.changePct.toFixed(2)}%
                      </span>
                    </div>
                    {it.flagged && <span className="text-tv-red text-[10px]">! {it.flagReason}</span>}
                    <div className="text-[10px] text-tv-muted truncate">{it.topReasons?.[0] || '-'}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-number text-sm font-semibold text-white">{it.finalScore}</div>
                    <div className="text-[10px] text-tv-muted font-number">Rp {Math.round(it.price).toLocaleString('id-ID')}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </motion.div>

      {/* Market Movers - dulu 3 card grid (Gainer/Loser/Volume) sekaligus, sekarang
          1 card ber-tab (spec BUILD 001: kurangi section panjang dengan tabs) -
          MarketMoverCard & formatCardItems tidak berubah, cuma dipilih satu per waktu. */}
      {(() => {
        type MoversTabKey = 'gainer' | 'loser' | 'volume' | 'technicalBearish' | 'rsiOversold';
        const MOVERS_DEFS: Record<MoversTabKey, CardDef> = {
          gainer: { id: 'gainer', title: 'Saham dengan Kenaikan Tertinggi', sub: 'Top Gainer', accent: 'green', Icon: TrendingUp, key: 'gainer', listPath: '/market/top-gainer' },
          loser: { id: 'loser', title: 'Saham dengan Penurunan Terdalam', sub: 'Top Loser', accent: 'red', Icon: TrendingDown, key: 'loser', listPath: '/market/top-loser' },
          volume: { id: 'volume', title: 'Berdasarkan Volume Lembar Saham', sub: 'Top Volume • Lot', accent: 'slate', Icon: BarChart3, key: 'volume', listPath: '/market/top-volume' },
          // Dipindah dari landing page "/" (components/Dashboard.tsx) - gabung ke tab
          // Market Movers yang sama, bukan card terpisah lagi.
          technicalBearish: { id: 'technicalBearish', title: 'Sinyal Teknikal Bearish (MA20 < MA50)', sub: 'Technical Signal', accent: 'red', Icon: TrendingDown, key: 'technicalBearish', listPath: '/market/technical-bearish' },
          rsiOversold: { id: 'rsiOversold', title: 'RSI Oversold (Potensi Rebound)', sub: 'RSI (14) Terendah', accent: 'warning', Icon: Activity, key: 'rsiOversold', listPath: '/market/rsi-oversold' },
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
              <Card>
                <EmptyState title="Data pasar sementara tidak tersedia." action={{ label: 'Coba lagi', onClick: fetchMarket }} />
              </Card>
            ) : (
              <>
                <SegmentedControl
                  layoutId="home-movers-tab"
                  value={moversTab}
                  onChange={(v) => setMoversTab(v as MoversTabKey)}
                  options={[
                    { label: 'Top Gainer', value: 'gainer' },
                    { label: 'Top Loser', value: 'loser' },
                    { label: 'Top Volume', value: 'volume' },
                    { label: 'Bearish', value: 'technicalBearish' },
                    { label: 'RSI Oversold', value: 'rsiOversold' },
                  ]}
                />
                <MarketMoverCard card={activeCard} lastUpdated={moversTimeLabel} loaded={!loadingMarket} />
              </>
            )}
          </motion.div>
        );
      })()}

      {/* LensScanner - teaser, bukan full table (spec: full scanner sudah punya
          halaman sendiri /screener). */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <Card hoverable className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-tv-purple/10 border border-tv-purple/25 text-tv-purple flex items-center justify-center">
              <Filter className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-heading text-sm font-bold text-white">LensScanner</h4>
              <p className="text-xs text-tv-muted">Filter saham multi-faktor sesuai profil risiko Anda</p>
            </div>
          </div>
          <Link href="/screener" className="shrink-0 px-3 py-1.5 rounded-md bg-tv-blue hover:bg-tv-blueHover text-white text-xs font-semibold transition-colors">
            Buka LensScanner
          </Link>
        </Card>
      </motion.div>

      {/* LensWatch - ringkasan singkat, EmptyState kalau watchlist masih kosong
          (bukan "tidak ada data" polos). */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-tv-blue" />
              <CardTitle>LensWatch</CardTitle>
            </div>
            <Link href="/watchlist" className="text-[11px] text-tv-blue hover:underline">Kelola</Link>
          </CardHeader>
          {watchlistCount === null ? (
            <Skeleton className="h-11 w-full" />
          ) : watchlistCount === 0 ? (
            <EmptyState
              title="Belum ada saham di watchlist"
              description="Tambahkan saham untuk mulai memantau harga & alert."
              action={{ label: 'Tambah Watchlist', onClick: () => { window.location.href = '/watchlist'; } }}
            />
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {watchlistPreview.map((w) => (
                  <span key={w.symbol} className="font-number text-xs font-bold text-white bg-tv-bg/50 border border-tv-border rounded-md px-2.5 py-1.5">
                    {w.symbol.replace('.JK', '')}
                  </span>
                ))}
              </div>
              <span className="text-xs text-tv-muted">{watchlistCount} saham dipantau</span>
            </div>
          )}
        </Card>
      </motion.div>

      <PromoUpgradeModal open={showPromoModal} onClose={handleClosePromo} onSelectPlan={handleSelectPlan} />
      {(() => {
        const selectedPlan = PRICING_PLANS.find((p) => p.id === promoPlan) || PRICING_PLANS[0];
        return (
          <PaywallModal
            open={showPaywallFromPromo}
            onClose={() => setShowPaywallFromPromo(false)}
            title={`Upgrade ke ${selectedPlan.label} Pro`}
            body={`${formatRupiah(selectedPlan.finalPrice)}${selectedPlan.discountPct > 0 ? ` (hemat ${selectedPlan.discountPct}%)` : ''} - buka semua fitur Pro SahamLens.`}
            benefits={FULL_FEATURE_LIST}
            waText={`Halo, saya sudah transfer untuk upgrade ke SahamLens Pro paket ${selectedPlan.label} (${formatRupiah(selectedPlan.finalPrice)}). Ini bukti transfernya.`}
          />
        );
      })()}
    </PageContainer>
  );
}
