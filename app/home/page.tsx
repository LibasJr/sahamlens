'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Activity,
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
import { useLanguage } from '@/lib/i18n';

import { PRICING_PLANS, FULL_FEATURE_LIST, formatRupiah, type PricingPlan } from '@/shared/config/pricing';
import { MarketMoverCard, formatCardItems, type CardDef, type MoverCard } from '@/components/MarketMoverCard';
import { isMarketOpen, getMarketStatus } from '@/lib/utils/market';


const PromoUpgradeModal = dynamic(() => import('@/components/PromoUpgradeModal'), { ssr: false });
const PaywallModal = dynamic(() => import('@/components/PaywallModal'), { ssr: false });

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
  // `items` sudah lama dikirim /api/daily-picks (maksimal 5 simbol per kategori) tapi
  // tidak pernah dipakai beranda - hanya `count` yang dirender, sehingga "2 saham"
  // tidak punya jalan ke saham yang mana. Tidak ada rute daftar golden/dead cross:
  // tab-nya dihapus dari /breakout-radar pada audit 2026-08-03. Simbolnya dirender
  // langsung di sini, jadi tidak perlu halaman baru maupun request tambahan.
  goldenCross: { count: number; stale: boolean; items?: string[] };
  deadCross: { count: number; stale: boolean; items?: string[] };
}

interface NewsInsight {
  title: string;
  sentiment: 'POSITIF' | 'NEGATIF' | 'NETRAL';
}

// Jeda antar insight LensConsensus (permintaan user 2026-08-06: 50 detik SEBELUMNYA
// dianggap terlalu cepat berpindah untuk sempat dibaca - satu-satunya konten
// kartu ini sebelumnya cuma satu paragraf statis, tidak pernah berganti sama sekali).
const INSIGHT_ROTATE_MS = 12_000;

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
  if (!Number.isFinite(total) || total <= 0) {
    return (
      <div className="rounded-xl border border-tv-border/80 bg-tv-card/40 p-4 sm:p-5 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-tv-muted">
          <BarChart3 className="w-4 h-4 text-tv-blue" />
          Market Breadth
        </div>
        <p className="mt-3 text-sm text-tv-muted">Data breadth belum tersedia. SahamLens tidak mengubah data kosong menjadi breadth 0% atau sinyal pasar.</p>
      </div>
    );
  }
  const unchanged = Math.max(0, total - (advancing + declining));
  const denom = total;
  const advPct = Math.round((advancing / denom) * 100);
  const decPct = Math.round((declining / denom) * 100);
  const unchPct = Math.max(0, 100 - advPct - decPct);
  const ratio = declining > 0 ? advancing / declining : advancing;

  // Kalimatnya menerjemahkan rasio jadi kondisi pasar. Ambangnya sengaja lebar
  // (2:1 dan 1:2) supaya hari-hari biasa disebut "seimbang", bukan didramatisir.
  const verdict =
    ratio >= 2 ? { text: 'Partisipasi naik luas — mayoritas saham ikut menguat, momentum pasar positif.', tone: 'text-tv-green', bgTone: 'border-tv-green/30 bg-tv-green/10 text-tv-green' }
    : ratio <= 0.5 ? { text: 'Tekanan jual merata — pelemahan meluas ke hampir seluruh sektor.', tone: 'text-tv-red', bgTone: 'border-tv-red/30 bg-tv-red/10 text-tv-red' }
    : { text: 'Pasar berimbang — pergerakan indeks lebih ditentukan oleh bobot emiten berkapitalisasi besar.', tone: 'text-tv-muted', bgTone: 'border-tv-border bg-tv-card/60 text-tv-text/90' };

  return (
    <div className="rounded-xl border border-tv-border/80 bg-tv-card/40 p-4 sm:p-5 backdrop-blur-sm space-y-4">
      {/* Header & Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-tv-blue" />
          <span className="text-xs font-bold uppercase tracking-wider text-tv-muted">Market Breadth</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-tv-card border border-tv-border text-tv-muted font-number font-medium">
            <AnimatedNumber value={total} className="font-number font-semibold text-tv-text" /> Saham
          </span>
        </div>

        {/* 3 KPI Summary Badges */}
        <div className="flex items-center gap-2 text-xs font-semibold flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-tv-green/30 bg-tv-green/10 text-tv-green font-number">
            <span className="w-2 h-2 rounded-full bg-tv-green animate-pulse" />
            <AnimatedNumber value={advancing} /> Naik ({advPct}%)
          </span>
          {unchanged > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-tv-border bg-tv-card text-tv-muted font-number">
              <span className="w-2 h-2 rounded-full bg-tv-muted/60" />
              <AnimatedNumber value={unchanged} /> Netral ({unchPct}%)
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-tv-red/30 bg-tv-red/10 text-tv-red font-number">
            <span className="w-2 h-2 rounded-full bg-tv-red" />
            <AnimatedNumber value={declining} /> Turun ({decPct}%)
          </span>
        </div>
      </div>

      {/* Modern Thicker Segmented Breadth Bar */}
      <div className="space-y-1.5">
        <div className="flex h-3.5 sm:h-4 w-full overflow-hidden rounded-full bg-tv-hover/80 p-0.5 border border-tv-border/50 shadow-inner" role="img" aria-label={`${advancing} saham naik, ${declining} saham turun`}>
          <div
            className="h-full bg-gradient-to-r from-emerald-600 to-tv-green rounded-l-full transition-all duration-700 ease-settle shadow-sm"
            style={{ width: `${advPct}%` }}
          />
          {unchanged > 0 && (
            <div
              className="h-full bg-tv-muted/40 transition-all duration-700 ease-settle"
              style={{ width: `${unchPct}%` }}
            />
          )}
          <div
            className="h-full bg-gradient-to-r from-tv-red to-rose-600 rounded-r-full transition-all duration-700 ease-settle shadow-sm"
            style={{ width: `${decPct}%` }}
          />
        </div>
      </div>

      {/* Storytelling Verdict Box */}
      <div className={`p-3 rounded-lg border text-xs sm:text-[13px] leading-relaxed flex items-center gap-2.5 ${verdict.bgTone}`}>
        <Activity className="w-4 h-4 shrink-0 opacity-80" />
        <span>{verdict.text}</span>
      </div>
    </div>
  );
}

/**
 * Saham di balik angka persilangan MA, sebagai chip yang bisa diklik.
 *
 * Sebelum ini kartu Golden/Dead Cross hanya menampilkan jumlahnya - "2 saham" tanpa
 * satu pun cara mengetahui saham mana. Daftar simbolnya sebenarnya sudah ikut di
 * respons /api/daily-picks sejak awal; beranda membuangnya.
 *
 * Tujuannya /technical/[symbol], bukan halaman daftar khusus: rute golden/dead cross
 * tidak ada lagi sejak tab-tabnya dilebur di audit 2026-08-03.
 *
 * min-h-11 (44px) disengaja. Chip ini tautan yang ditekan di layar sentuh, jadi
 * mengikuti ambang 44px - bukan cuma minimum WCAG 2.5.8 (24px), yang sebenarnya
 * sudah lolos di tinggi asalnya 29px.
 */
function CrossSymbolChips({ symbols, tone }: { symbols?: string[]; tone: 'positive' | 'negative' }) {
  if (!symbols?.length) return null;
  const warna = tone === 'positive'
    ? 'border-tv-green/25 bg-tv-green/10 text-tv-green hover:border-tv-green/50'
    : 'border-tv-red/25 bg-tv-red/10 text-tv-red hover:border-tv-red/50';
  return (
    <div className="flex flex-wrap gap-1.5">
      {symbols.map((s) => (
        <Link
          key={s}
          href={`/technical/${s}.JK`}
          className={`font-number inline-flex min-h-11 items-center rounded-md border px-2.5 text-[11px] font-bold transition-colors ${warna}`}
        >
          {s}
        </Link>
      ))}
    </div>
  );
}

/**
 * Heatmap sektor: intensitas warna = besar perubahan, dipotong di 3% supaya satu
 * sektor ekstrem tidak membuat sisanya tampak abu-abu seragam.
 */
function SectorHeatmap({ sectors }: { sectors: { sector: string; changePct: number }[] }) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  if (sectors.length === 0) {
    return (
      <EmptyState
        illustration="empty"
        title={isEn ? 'Sector data not available yet' : 'Data sektor belum masuk'}
        description={isEn ? 'Sector heatmap populates once market trading commences.' : 'Heatmap sektor terisi setelah sesi perdagangan berjalan.'}
      />
    );
  }

  const sorted = [...sectors].sort((a, b) => b.changePct - a.changePct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const INTENSITY_CAP_PCT = 3;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-tv-muted">
          {isEn ? 'IDX 11 Sectors Performance' : 'Performa 11 Sektor IDX'}
        </h4>
        <span className="text-[11px] text-tv-muted/80">{isEn ? 'Sorted by strength' : 'Disortir dari terkuat'}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
        {sorted.map((s) => {
          const isPos = s.changePct > 0;
          const isNeg = s.changePct < 0;
          const magnitude = Math.min(Math.abs(s.changePct) / INTENSITY_CAP_PCT, 1);
          const alpha = 0.08 + magnitude * 0.35;
          const rgb = isPos ? '34,197,94' : isNeg ? '239,68,68' : '148,163,184';

          return (
            <div
              key={s.sector}
              title={`${s.sector}: ${isPos ? '+' : ''}${s.changePct.toFixed(2)}%`}
              className="group relative flex flex-col justify-between rounded-xl border border-tv-border/80 p-3 sm:p-3.5 transition-all duration-200 ease-settle hover:scale-[1.02] hover:border-tv-borderLight hover:shadow-md cursor-default overflow-hidden"
              style={{ background: `rgba(${rgb}, ${alpha})` }}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs sm:text-[13px] font-semibold text-tv-text/95 truncate">
                  {s.sector}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isPos ? 'bg-tv-green/20 text-tv-green' : isNeg ? 'bg-tv-red/20 text-tv-red' : 'bg-tv-muted/20 text-tv-muted'}`}>
                  {isPos ? '▲' : isNeg ? '▼' : '●'}
                </span>
              </div>
              <div className={`font-number text-sm sm:text-base font-bold mt-2 ${isPos ? 'text-tv-green' : isNeg ? 'text-tv-red' : 'text-tv-muted'}`}>
                {isPos ? '+' : ''}{s.changePct.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length > 1 && (
        <div className="p-3 rounded-lg border border-tv-border/60 bg-tv-card/30 text-xs text-tv-muted leading-relaxed">
          {isEn ? (
            <>
              <span className="text-tv-green font-semibold">{best.sector}</span> leading ({best.changePct >= 0 ? '+' : ''}{best.changePct.toFixed(2)}%),{' '}
              <span className="text-tv-red font-semibold">{worst.sector}</span> lagging ({worst.changePct >= 0 ? '+' : ''}{worst.changePct.toFixed(2)}%) — spread of{' '}
              <span className="font-number font-bold text-tv-text">{(best.changePct - worst.changePct).toFixed(2)} percentage points</span> between strongest and weakest sectors.
            </>
          ) : (
            <>
              <span className="text-tv-green font-semibold">{best.sector}</span> memimpin ({best.changePct >= 0 ? '+' : ''}{best.changePct.toFixed(2)}%),{' '}
              <span className="text-tv-red font-semibold">{worst.sector}</span> tertinggal ({worst.changePct >= 0 ? '+' : ''}{worst.changePct.toFixed(2)}%) — selisih{' '}
              <span className="font-number font-bold text-tv-text">{(best.changePct - worst.changePct).toFixed(2)} poin persen</span> antar sektor terkuat dan terlemah.
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const { t, dictionary, language } = useLanguage();
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
  const [radarPreparing, setRadarPreparing] = useState(false);
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
        if (!liveJkse || !summary) { setMarketError(true); return; }
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
          const snapshotTime = new Date(summary.timestamp);
          setMoversTimeLabel(Number.isNaN(snapshotTime.getTime())
            ? null
            : new Intl.DateTimeFormat('id-ID', {
                timeZone: 'Asia/Jakarta', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              }).format(snapshotTime) + ' WIB');
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
    setRadarPreparing(false);
    fetch('/api/ai-pick', { cache: 'no-store' })
      .then((r) => {
        if (r.status === 401) { setPicksLoginRequired(true); return null; }
        if (r.status === 402) { setPicksNeedPro(true); return null; }
        if (!r.ok) { setRadarError(true); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        if (d.error) { setRadarError(true); return; }
        if (d.ready === false) { setRadarItems([]); setRadarStale(false); setRadarPreparing(true); return; }
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
      .then((r) => (r.ok ? r.json() : r.status === 401 ? { loginRequired: true } : null))
      .then((d) => {
        if (d?.loginRequired) { setWatchlistCount(-1); return; }
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
    if (loadingMarket || loadingRadar || loadingDailyPicks) return;
    setAiBriefing(null);
    fetch('/api/ai-briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topPick: topPick ? {
          ticker: topPick.symbol.replace('.JK', ''),
          consensus: topPick.flagged ? topPick.flagReason : (language === 'en' ? 'Strong Signal' : 'Sinyal Kuat'),
          confidence: topPick.finalScore,
        } : null,
        indices: ihsg ? [{ name: 'IHSG', changePct: ihsg.changePct }] : [],
        pickCounts: dailyPicks ? {
          attractive: dailyPicks.attractive.count,
          breakout: dailyPicks.breakout.count,
          undervalue: dailyPicks.undervalue.count,
        } : undefined,
        lang: language,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.briefing) setAiBriefing(d.briefing); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMarket, loadingRadar, loadingDailyPicks, language]);

  // Sumber insight tambahan untuk kartu LensConsensus: 4 berita pasar teratas dari
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
        ...newsInsights.map((n, i) => (
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
    <PageContainer className="min-h-full flex flex-col space-y-5 p-4 md:p-6 lg:p-7">
      {/* Header ringkas - hasil audit tata letak 2026-08-13.
       *
       * TIGA HAL DIBUANG DARI SINI, semuanya karena mengorbankan layar pertama:
       *
       * 1. Tombol "Kembali ke halaman utama" yang dulu menjadi elemen PALING ATAS.
       *    Bagi pengguna yang sudah masuk, halaman INILAH halaman utamanya - tombol
       *    kembali di puncaknya membingungkan (seolah sedang berada di halaman
       *    bersarang) sekaligus memakan piksel paling mahal di seluruh aplikasi.
       *    KOREKSI: versi pertama komentar ini menulis "jalan ke landing tetap ada lewat
       *    logo di TopMarketBar" - itu SALAH dan sempat mengunci pengguna dari "/".
       *    Logo Sidebar menunjuk ke /home, TopMarketBar tidak punya tautan ke "/".
       *    Navigasi ke halaman lain tetap tersedia dari menu utama; tidak perlu
       *    menambahkan tombol kembali yang mengganggu fokus Beranda.
       * 2. Badge "Daily workspace" + label "Data server + ...". Keduanya metadata,
       *    bukan informasi yang dicari orang saat membuka beranda.
       * 3. Kalimat instruksi "Mulai dari kondisi pasar, temukan kandidat...". Urutan
       *    kartu di bawah sudah menyatakan alurnya; menuliskannya lagi memakan satu
       *    baris penuh untuk mengulang apa yang sudah terlihat.
       *
       * Terukur sebelum perubahan: angka pasar PERTAMA di dalam konten baru muncul
       * di y=773px, sementara lipatan HP ada di 844px - satu layar penuh habis untuk
       * pembukaan. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="lens-page-title">Beranda</h1>
        <div className="flex gap-2 overflow-x-auto">
          <Link href="/breakout-radar" className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 text-[11px] font-semibold text-white/80 transition hover:bg-white/[0.06] hover:text-white">
            <Radar className="h-3.5 w-3.5 text-tv-purple" /> Peluang hari ini
          </Link>
          <Link href="/screener" className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 text-[11px] font-semibold text-white/80 transition hover:bg-white/[0.06] hover:text-white">
            <Filter className="h-3.5 w-3.5 text-tv-blue" /> Scan saham
          </Link>
        </div>
      </div>

      {/* Market Pulse - sector strength + breadth dari /api/market-pulse (Pro-gated,
          sama seperti gerbang Today's Opportunities di bawah - user non-Pro/anon lihat
          upsell, bukan data kosong). IHSG dicabut dari sini (redundan - sudah tampil
          terus-menerus di TopMarketBar global sejak Phase 1). */}
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <Card hoverable>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-tv-purple" />
              {/* Judul menyebut FUNGSI, merek jadi keterangan. Sebelumnya kartu ini
                  menulis "LensMarket" dua kali dalam satu baris - judul di kiri dan
                  tautan di kanan - sehingga tautannya tidak memberi tahu apa pun. */}
              <CardTitle>Kondisi Pasar</CardTitle>
            </div>
            <Link href="/market-pulse" className="text-[11px] text-tv-blue hover:underline">Lihat semua</Link>
          </CardHeader>
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
              <p className="text-[10px] leading-relaxed text-tv-muted/80">
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
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-tv-muted">Persilangan Rata-rata Bergerak</h4>
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
          </div>
        </Card>
      </motion.div>

      {/* Peluang Hari Ini - SATU kartu, dulu DUA ("Peluang Teratas" + "Kandidat
          Berikutnya"). Penggabungan ini bukan sekadar kosmetik: keduanya membaca
          array `radarItems` YANG SAMA - hero memakai [0], daftar memakai slice(1,6) -
          jadi kartu terpisah memaksa lima cabang gerbang yang identik ditulis dua kali
          (loading, belum login, belum Pro, error, kosong). Satu sumber data, satu
          gerbang. Kalau nanti gerbangnya berubah, tidak ada lagi salinan kedua yang
          bisa lupa ikut diubah.

          Badge Delayed/Data-Sesi-Terakhir naik ke CardHeader supaya statusnya terbaca
          sebelum angkanya, bukan terselip di dalam badan kartu. */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <Card variant="default" padding="lg" className="border-tv-blue/30 shadow-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-tv-gold" />
              <CardTitle>Peluang Hari Ini</CardTitle>
              {radarStale || !isMarketOpen() ? (
                <Badge variant="neutral" dot>Data Sesi Terakhir</Badge>
              ) : (
                <Badge variant="danger" dot title="Data Yahoo Finance, delay ±15 menit dari kondisi pasar riil - bukan realtime">Delayed</Badge>
              )}
            </div>
            <Link href="/breakout-radar" className="text-[11px] text-tv-blue hover:underline">Lihat semua</Link>
          </CardHeader>

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
                {/* Kandidat berikutnya - slice(1,6), sengaja mulai dari indeks 1 supaya
                    saham hero tidak muncul dua kali. Dulu ini kartu sendiri; sekarang
                    lanjutan dari daftar yang sama, dipisah garis, bukan judul baru. */}
                {radarItems.length > 1 && (
                  <div className="mt-1 border-t border-tv-border pt-3">
                    <div className="mb-2.5 flex items-center gap-2">
                      <Radar className="h-3.5 w-3.5 text-tv-purple" />
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-tv-muted">Kandidat Berikutnya</h4>
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
                  </div>
                )}
              </div>
            );
          })()}
        </Card>
      </motion.div>

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
              <Card>
                <EmptyState title={isEn ? 'Market data temporarily unavailable.' : 'Data pasar sementara tidak tersedia.'} action={{ label: isEn ? 'Retry' : 'Coba lagi', onClick: fetchMarket }} />
              </Card>
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
        <Card variant="glass" padding="lg" className="border-tv-blue/20 bg-gradient-to-br from-tv-blue/[0.07] via-tv-card/90 to-tv-purple/[0.05] shadow-2">
          <div className="flex items-start gap-3 md:gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-accent shadow-[0_12px_32px_rgba(79,140,255,0.22)]">
              <Sparkles className="h-5 w-5 text-white" />
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
                    <button
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
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[10px] text-tv-muted">
                {language === 'en' ? 'Source: Yahoo Finance, delay ±15 min' : 'Sumber: Yahoo Finance, delay ±15 menit'}
              </p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Jadwal Terdekat & LensWatch sejajar 1 baris */}
      <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <motion.div variants={fadeUp}>
          <Card hoverable>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-tv-gold" />
                <CardTitle>{t('calendar.title')}</CardTitle>
              </div>
              <Link href="/calendar" className="text-[11px] text-tv-blue hover:underline">{t('calendar.viewAll')}</Link>
            </CardHeader>
            {calendarEvents === null ? (
              <div className="space-y-2">
                {[0, 1].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
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
                            {e.type === 'DIVIDEND' ? t('calendar.dividendType') : t('calendar.earningsType')}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-tv-muted truncate">{e.title}</div>
                      </div>
                      <span className="text-[11px] text-tv-muted font-number shrink-0">
                        {new Date(e.date).toLocaleDateString(language === 'en' ? 'en-US' : 'id-ID', { day: 'numeric', month: 'short' })}
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
                <CardTitle>Saham Dipantau</CardTitle>
              </div>
              <Link href="/watchlist" className="text-[11px] text-tv-blue hover:underline">Lihat semua</Link>
            </CardHeader>
            {/* BARU (2026-08-14, temuan Cloudflare Web Analytics - CLS 1.888 pada kartu
                LensScanner DI BAWAH kartu ini): tiga cabang di sini tinggi kontennya jauh
                beda - skeleton ~44px, EmptyState (kalau watchlist masih kosong) ~350an px
                dengan ilustrasi/progress/tombol. Watchlist kosong itu keadaan DEFAULT
                untuk akun/tamu baru, jadi urutan yang paling sering terjadi justru
                skeleton -> EmptyState, lompatan tinggi paling besar - mendorong kartu
                LensScanner di bawahnya turun drastis SETELAH render awal, persis definisi
                CLS. min-h dikunci di container supaya pergantian kontennya tidak
                menggeser layout di bawah kartu ini. */}
            <div className="min-h-[300px] flex flex-col justify-center">
              {watchlistCount === null ? (
                <Skeleton className="h-11 w-full" />
              ) : watchlistCount === -1 ? (
                <EmptyState illustration="locked" title="Masuk untuk melihat watchlist" description="Watchlist tersimpan di akunmu. Masuk untuk melihat saham dan alert yang sedang dipantau." action={{ label: 'Masuk', onClick: () => { window.location.href = '/login?next=%2Fhome'; } }} />
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
                        <TickerAvatar symbol={w.symbol} size="sm" className="!w-5 !h-5 !text-[10px]" />
                        {w.symbol.replace('.JK', '')}
                      </Link>
                    ))}
                  </div>
                  <span className="text-xs text-tv-muted">
                    <AnimatedNumber value={watchlistCount} className="font-number font-semibold text-tv-text" /> saham dipantau
                  </span>
                </div>
              )}
            </div>
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
              <h3 className="font-heading text-sm font-bold text-white">LensScanner</h3>
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
