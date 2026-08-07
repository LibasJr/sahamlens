'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
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
import {
  Card,
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
} from '@/components/ui';
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
  goldenCross: { count: number; stale: boolean };
  deadCross: { count: number; stale: boolean };
}

interface NewsInsight {
  title: string;
  sentiment: 'POSITIF' | 'NEGATIF' | 'NETRAL';
}

// Jeda antar insight LensAI (permintaan user 2026-08-06: 50 detik SEBELUMNYA
// dianggap terlalu cepat berpindah untuk sempat dibaca - satu-satunya konten
// LensAI sebelum ini cuma satu paragraf statis, tidak pernah berganti sama sekali).
const INSIGHT_ROTATE_MS = 12_000;

const SENTIMENT_LABEL: Record<NewsInsight['sentiment'], string> = {
  POSITIF: 'positif',
  NEGATIF: 'negatif',
  NETRAL: 'netral',
};

const SENTIMENT_BADGE_VARIANT: Record<NewsInsight['sentiment'], 'success' | 'danger' | 'info'> = {
  POSITIF: 'success',
  NEGATIF: 'danger',
  NETRAL: 'info',
};

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

/**
 * Breadth sebagai satu batang proporsional, bukan dua angka bersebelahan.
 * Perbandingannya langsung terbaca dari panjang segmen - itu inti informasinya,
 * dan itu yang hilang saat "312 naik / 254 turun" ditulis sebagai teks.
 */
function MarketBreadthBar({ breadth }: { breadth: { advancing: number; declining: number; total: number } }) {
  const { advancing, declining, total } = breadth;
  const denom = advancing + declining || 1;
  const advPct = (advancing / denom) * 100;
  const ratio = declining > 0 ? advancing / declining : advancing;

  // Kalimatnya menerjemahkan rasio jadi kondisi pasar. Ambangnya sengaja lebar
  // (2:1 dan 1:2) supaya hari-hari biasa disebut "seimbang", bukan didramatisir.
  const verdict =
    ratio >= 2 ? { text: 'Partisipasi naik luas - mayoritas saham ikut menguat, bukan cuma emiten besar.', tone: 'text-tv-green' }
    : ratio <= 0.5 ? { text: 'Tekanan jual merata - pelemahan tidak terbatas pada beberapa saham saja.', tone: 'text-tv-red' }
    : { text: 'Pasar terbelah cukup seimbang. Arah indeks lebih ditentukan bobot emiten besar hari ini.', tone: 'text-tv-muted' };

  return (
    <div className="rounded-md border border-tv-border bg-tv-bg/50 p-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wide text-tv-muted">Market Breadth</span>
        <span className="text-[11px] text-tv-muted">
          <AnimatedNumber value={total} className="font-number font-semibold text-tv-text" /> saham
        </span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-tv-hover" role="img" aria-label={`${advancing} saham naik, ${declining} saham turun`}>
        <div className="h-full bg-tv-green transition-[width] duration-700 ease-settle" style={{ width: `${advPct}%` }} />
        <div className="h-full bg-tv-red transition-[width] duration-700 ease-settle" style={{ width: `${100 - advPct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="font-number font-semibold text-tv-green">
          <AnimatedNumber value={advancing} className="font-number" /> naik
        </span>
        <span className="font-number font-semibold text-tv-red">
          turun <AnimatedNumber value={declining} className="font-number" />
        </span>
      </div>
      <p className={`mt-2 text-[11px] leading-relaxed ${verdict.tone}`}>{verdict.text}</p>
    </div>
  );
}

/**
 * Heatmap sektor: intensitas warna = besar perubahan, dipotong di 3% supaya satu
 * sektor ekstrem tidak membuat sisanya tampak abu-abu seragam.
 */
function SectorHeatmap({ sectors }: { sectors: { sector: string; changePct: number }[] }) {
  if (sectors.length === 0) {
    return <EmptyState illustration="empty" title="Data sektor belum masuk" description="Heatmap sektor terisi setelah sesi perdagangan berjalan." />;
  }

  const sorted = [...sectors].sort((a, b) => b.changePct - a.changePct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const INTENSITY_CAP_PCT = 3;

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        {sorted.map((s) => {
          const magnitude = Math.min(Math.abs(s.changePct) / INTENSITY_CAP_PCT, 1);
          const alpha = 0.08 + magnitude * 0.42;
          const rgb = s.changePct >= 0 ? '34,197,94' : '239,68,68';
          return (
            <div
              key={s.sector}
              title={`${s.sector}: ${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`}
              className="group rounded-md border border-tv-border px-2 py-2 transition-transform duration-150 ease-settle hover:scale-[1.03] hover:border-tv-borderLight cursor-default"
              style={{ background: `rgba(${rgb},${alpha})` }}
            >
              <div className="text-[10px] leading-tight text-tv-text/90 truncate">{s.sector}</div>
              <div className={`font-number text-xs font-bold mt-0.5 ${s.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>
      {sorted.length > 1 && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-tv-muted">
          <span className="text-tv-green font-medium">{best.sector}</span> memimpin ({best.changePct >= 0 ? '+' : ''}{best.changePct.toFixed(2)}%),{' '}
          <span className="text-tv-red font-medium">{worst.sector}</span> tertinggal ({worst.changePct >= 0 ? '+' : ''}{worst.changePct.toFixed(2)}%) - selisih{' '}
          <span className="font-number font-semibold text-tv-text">{(best.changePct - worst.changePct).toFixed(2)} poin persen</span> antar sektor.
        </p>
      )}
    </div>
  );
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
    { symbol: string; price: number; changePct: number; finalScore: number; coverage?: number | null; signals?: string[]; topReasons?: string[]; flagged: boolean; flagReason: string | null }[]
  >([]);
  const [loadingRadar, setLoadingRadar] = useState(true);
  const [radarError, setRadarError] = useState(false);
  const [radarStale, setRadarStale] = useState(false);
  const [moversTab, setMoversTab] = useState<'gainer' | 'loser' | 'volume' | 'technicalBearish' | 'rsiOversold'>('gainer');
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null);
  const [watchlistPreview, setWatchlistPreview] = useState<{ symbol: string }[]>([]);

  const [moversFreshness, setMoversFreshness] = useState<string | null>(null);
  const [moversTimeLabel, setMoversTimeLabel] = useState<string | null>(null);

  const [marketError, setMarketError] = useState(false);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [loadingDailyPicks, setLoadingDailyPicks] = useState(true);
  const [picksNeedPro, setPicksNeedPro] = useState(false);
  const [picksLoginRequired, setPicksLoginRequired] = useState(false);
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [newsInsights, setNewsInsights] = useState<NewsInsight[]>([]);
  const [insightIndex, setInsightIndex] = useState(0);
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
        if (
          liveJkse &&
          typeof liveJkse.price === 'number' &&
          Number.isFinite(liveJkse.price) &&
          liveJkse.price > 0 &&
          typeof liveJkse.changePercent === 'number' &&
          Number.isFinite(liveJkse.changePercent)
        ) {
          setIhsg({ price: liveJkse.price, changePct: liveJkse.changePercent });
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
        if (d?.breadth && d?.sectorHeatmap) setMarketPulse({ sectorHeatmap: d.sectorHeatmap, breadth: d.breadth });
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
        if (!r.ok) { setRadarError(true); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        if (d.error || d.ready === false) { setRadarItems([]); setRadarStale(false); return; }
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
          consensus: topPick.flagged ? topPick.flagReason : 'Sinyal Kuat',
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

  // Sumber insight tambahan untuk kartu LensAI: 4 berita pasar teratas dari
  // /api/news (judul + sentimen, sudah dihitung getMarketNews() - lihat
  // modules/news/service/news.service.ts). Dicache 15 menit di server, jadi fetch
  // ulang di sini murah.
  useEffect(() => {
    fetch('/api/news')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const items = Array.isArray(d?.items) ? d.items.slice(0, 4) : [];
        setNewsInsights(items.map((item: any) => ({ title: item.title, sentiment: item.sentiment })));
      })
      .catch(() => {});
  }, []);

  const primaryInsight: React.ReactNode | null = aiBriefing ? (
    <p className="text-sm text-tv-text mt-1.5 leading-relaxed">{aiBriefing}</p>
  ) : picksLoginRequired ? (
    <p className="text-sm text-tv-muted mt-1.5">Login untuk melihat sinyal AI harian.</p>
  ) : picksNeedPro ? (
    <p className="text-sm text-tv-muted mt-1.5">Upgrade ke Pro untuk melihat sinyal AI harian.</p>
  ) : topPick ? (
    <p className="text-sm text-tv-text mt-1.5 leading-relaxed">
      Sinyal AI hari ini: <span className="font-number font-semibold text-tv-blue">{topPick.symbol.replace('.JK', '')}</span>{' '}
      <Badge variant={topPick.flagged ? 'danger' : 'success'} className="mx-1">
        {topPick.flagged ? topPick.flagReason : 'Sinyal Kuat'}
      </Badge>
      dengan LensScore <span className="font-number font-semibold">{topPick.finalScore}/100</span>.
    </p>
  ) : (
    <p className="text-sm text-tv-muted mt-1.5">Belum ada sinyal kuat hari ini. Cek Stock Recommendations untuk detail lengkap.</p>
  );

  // Slot 0 = sinyal AI/ringkasan pasar (logic di atas, tidak berubah). Slot 1+ =
  // berita pasar terbaru. Kosong sampai loadingRadar selesai - jangan ikut
  // dirotasi selagi masih skeleton.
  const insightSlots: React.ReactNode[] = loadingRadar
    ? []
    : [
        primaryInsight,
        ...newsInsights.map((n, i) => (
          <p key={`news-${i}`} className="text-sm text-tv-text mt-1.5 leading-relaxed">
            <Badge variant={SENTIMENT_BADGE_VARIANT[n.sentiment]} className="mr-1.5 align-middle">
              {SENTIMENT_LABEL[n.sentiment]}
            </Badge>
            {n.title}
          </p>
        )),
      ];

  // Ganti insight tiap 12 detik - cukup cepat untuk terasa hidup, tapi masih memberi
  // waktu membaca ringkasan/berita. Tidak jalan
  // kalau cuma 1 slot (tidak ada apa pun untuk dirotasi).
  useEffect(() => {
    if (insightSlots.length <= 1) return;
    const t = setInterval(() => setInsightIndex((i) => i + 1), INSIGHT_ROTATE_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightSlots.length]);

  const activeInsightIndex = insightSlots.length ? insightIndex % insightSlots.length : 0;

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
              ) : (
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
              )}
              {/* Titik penanda - cuma tampil kalau memang ada lebih dari satu insight
                  untuk dirotasi (mis. berita belum termuat). Bukan tombol - klik pindah
                  manual tidak diminta, ini murni orientasi "sedang lihat yang mana". */}
              {!loadingRadar && insightSlots.length > 1 && (
                <div className="flex items-center gap-1.5 mt-2.5">
                  {insightSlots.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1 rounded-full transition-all duration-300 ${
                        i === activeInsightIndex ? 'w-5 bg-tv-blue' : 'w-1 bg-white/15'
                      }`}
                    />
                  ))}
                </div>
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
              <p className="text-[10px] leading-relaxed text-tv-muted/80">
                Heatmap menampilkan 11 sektor IDX berbasis sampel saham representatif per sektor, bukan seluruh emiten.
              </p>
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
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton variant="circle" className="h-12 w-12" />
                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" className="w-32" />
                  <Skeleton variant="text" className="w-20" />
                </div>
                <Skeleton className="h-10 w-16" />
              </div>
              <LoadingFact />
            </div>
          ) : picksLoginRequired ? (
            <EmptyState title="Login untuk melihat Today's Opportunities" description="Sinyal AI harian butuh akun." />
          ) : picksNeedPro ? (
            <EmptyState title="Fitur Pro" description="Upgrade ke Pro untuk melihat Today's Opportunities." />
          ) : radarError ? (
            <EmptyState title="Data pasar sementara tidak tersedia." action={{ label: 'Coba lagi', onClick: fetchRadar }} />
          ) : !radarItems[0] ? (
            /* Phase 0 (P0-1/P0-3): daftar bisa kosong karena saham berstatus 'DATA TIDAK
               CUKUP' dan yang tidak lolos gerbang kelayakan DIKELUARKAN, bukan diberi
               peringkat rendah. Deskripsinya menyebut sebabnya, bukan cuma "coba lagi". */
            <EmptyState title="Belum ada peluang kuat hari ini" description="Tidak ada saham yang lolos ambang kualitas + kelengkapan data hari ini. Saham berdata tidak lengkap atau berlikuiditas sangat rendah sengaja tidak ditampilkan." />
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
                    <div className="text-[10px] text-tv-muted uppercase tracking-wide">LensScore</div>
                    <div className="font-number text-3xl font-bold text-tv-blue">
                      <AnimatedNumber value={hero.finalScore} format={(n) => String(Math.round(n))} />
                      <span className="text-sm font-normal text-tv-muted">/100</span>
                    </div>
                    {typeof hero.coverage === 'number' && (
                      <div className="text-[10px] text-tv-muted">data {hero.coverage}%</div>
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

      {/* LensRadar - dulu "Sinyal Teknikal Bullish" generik (MA20>MA50), sekarang
          LensRadar Live sungguhan (skor komposit + alasan) dari /api/ai-pick, sama
          sumber data dengan app/breakout-radar/page.tsx. Tidak ada status EARLY/
          WATCH/BREAKOUT dst - backend tidak menghitung itu, lihat audit spec. */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
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
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              <LoadingFact className="mt-3" />
            </div>
          ) : picksLoginRequired ? (
            <EmptyState title="Login untuk melihat LensRadar" description="Sinyal AI harian butuh akun." />
          ) : picksNeedPro ? (
            <EmptyState title="Fitur Pro" description="Upgrade ke Pro untuk melihat LensRadar." />
          ) : radarError ? (
            <EmptyState
              title="Data pasar sementara tidak tersedia."
              action={{ label: 'Coba lagi', onClick: fetchRadar }}
            />
          ) : radarItems.length <= 1 ? (
            <EmptyState
              illustration="search"
              title="Belum ada sinyal kuat hari ini"
              description="Saham yang datanya tidak cukup atau tidak lolos gerbang kelayakan sengaja tidak ditampilkan di sini - daftar kosong berarti tidak ada yang lolos, bukan tidak ada yang dipindai."
            />
          ) : (
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
                        <span className={`text-[11px] font-number ${it.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                          {it.changePct >= 0 ? '+' : ''}{it.changePct.toFixed(2)}%
                        </span>
                      </div>
                      {it.flagged && <span className="text-tv-red text-[10px]">! {it.flagReason}</span>}
                      {/* Sebelumnya baris ini jatuh ke '-' polos saat topReasons kosong -
                          user tidak bisa membedakan "tidak ada alasan" dari "alasannya
                          gagal dimuat". Sekarang kekosongannya dinamai. */}
                      <div className="text-[10px] text-tv-muted truncate">
                        {it.topReasons?.[0] ?? (it.signals?.[0] || 'Lolos ambang skor, rincian alasan belum tersedia')}
                      </div>
                    </div>
                    {/* Bar skor: posisi relatif terhadap 100 langsung terbaca tanpa
                        membandingkan angka satu per satu antar baris. */}
                    <div className="text-right shrink-0 w-20">
                      <div className="font-number text-sm font-semibold text-white">
                        {it.finalScore}<span className="text-[10px] font-normal text-tv-muted">/100</span>
                      </div>
                      <div className="mt-1 h-1 w-full rounded-full bg-tv-hover overflow-hidden">
                        <div
                          className={`h-full rounded-full ${it.flagged ? 'bg-tv-warning' : 'bg-tv-green'}`}
                          style={{ width: `${Math.min(100, Math.max(0, it.finalScore))}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-tv-muted font-number mt-1">Rp {Math.round(it.price).toLocaleString('id-ID')}</div>
                    </div>
                  </Link>
                </motion.div>
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
          // Judul diperbaiki (audit 2026-08-05, temuan M-5): daftar ini diranking dari RSI
          // TERENDAH, tanpa syarat < 30 - menyebutnya "RSI Oversold" membuat saham ber-RSI
          // 55 pun terbaca sebagai oversold pada hari pasar kuat.
          rsiOversold: { id: 'rsiOversold', title: 'RSI (14) Terendah Hari Ini', sub: 'Kandidat jenuh jual - cek nilai RSI-nya', accent: 'warning', Icon: Activity, key: 'rsiOversold', listPath: '/market/rsi-oversold' },
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
                    { label: 'RSI Terendah', value: 'rsiOversold' },
                  ]}
                />
                <MarketMoverCard card={activeCard} lastUpdated={moversTimeLabel} loaded={!loadingMarket} />
              </>
            )}
          </motion.div>
        );
      })()}

      {/* Insights - Golden/Dead Cross count dari dailyPicks (sudah di-fetch di atas
          untuk teks AI briefing, sekarang juga dirender sebagai widget sendiri -
          zero fetch baru). */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-tv-blue" />
              <CardTitle>Market Insights</CardTitle>
            </div>
            <Link href="/breakout-radar" className="text-[11px] text-tv-blue hover:underline">LensRadar</Link>
          </CardHeader>
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
                <MetricCard
                  label="Golden Cross"
                  value={dailyPicks.goldenCross.count}
                  tone="positive"
                  suffix="saham"
                  hint={dailyPicks.goldenCross.stale ? 'Data sesi terakhir' : 'MA20 memotong MA50 dari bawah hari ini'}
                />
                <MetricCard
                  label="Dead Cross"
                  value={dailyPicks.deadCross.count}
                  tone="negative"
                  suffix="saham"
                  hint={dailyPicks.deadCross.stale ? 'Data sesi terakhir' : 'MA20 memotong MA50 dari atas hari ini'}
                />
              </div>
              {/* Storytelling: dua angka mentah tidak memberi tahu apa pun sampai
                  dibandingkan satu sama lain. */}
              <p className="mt-3 text-[11px] leading-relaxed text-tv-muted">
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
        </Card>
      </motion.div>

      {/* Jadwal Terdekat & LensWatch sejajar 1 baris - dua-duanya card isi-list yang
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
              <EmptyState
                illustration="empty"
                title="Belum ada jadwal dalam waktu dekat"
                description="Cakupan kalender terbatas pada Dividen & Earnings - data RUPS dan stock split IDX tidak tersedia dari sumber harga yang dipakai."
              />
            ) : (
              <div className="space-y-2">
                {calendarEvents.map((e, i) => (
                  <motion.div key={`${e.symbol}-${e.date}-${i}`} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.995 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
                    <Link
                      href={`/technical/${e.symbol}.JK`}
                      className="flex items-center gap-3 bg-tv-bg/50 border border-tv-border rounded-md px-3 py-2 hover:border-tv-borderLight hover:bg-tv-hover/40 transition-colors"
                    >
                      <TickerAvatar symbol={e.symbol} size="sm" />
                      <div className="min-w-0 flex-1">
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
                  </motion.div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* LensWatch - ringkasan singkat, EmptyState kalau watchlist masih kosong
            (bukan "tidak ada data" polos). */}
        <motion.div variants={fadeUp}>
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
                illustration="collecting"
                title="Belum ada saham di watchlist"
                description="Tambahkan saham untuk mulai memantau harga & alert."
                progress={{ current: 0, total: 5, unit: 'saham', label: 'Watchlist terisi' }}
                action={{ label: 'Tambah Watchlist', onClick: () => { window.location.href = '/watchlist'; } }}
              />
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex gap-2">
                  {watchlistPreview.map((w) => (
                    <Link
                      key={w.symbol}
                      href={`/technical/${w.symbol}`}
                      className="flex items-center gap-2 font-number text-xs font-bold text-white bg-tv-bg/50 border border-tv-border rounded-md pl-1.5 pr-2.5 py-1.5 hover:border-tv-borderLight hover:bg-tv-hover/40 transition-colors"
                    >
                      <TickerAvatar symbol={w.symbol} size="sm" className="!w-5 !h-5 !text-[8px]" />
                      {w.symbol.replace('.JK', '')}
                    </Link>
                  ))}
                </div>
                <span className="text-xs text-tv-muted">
                  <AnimatedNumber value={watchlistCount} className="font-number font-semibold text-tv-text" /> saham dipantau
                </span>
              </div>
            )}
          </Card>
        </motion.div>
      </motion.div>

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
