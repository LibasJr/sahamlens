'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Activity,
  Newspaper,
  Menu,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Flame,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { fadeUp, staggerContainer } from '@/lib/motion';
import PromoUpgradeModal from '@/components/PromoUpgradeModal';
import PaywallModal from '@/components/PaywallModal';

interface AiPick {
  ticker: string;
  price: number;
  changePct: number;
  consensus: string;
  confidence: number;
}

interface MarketMover {
  symbol: string;
  changePct: number;
  price: number;
}

interface DailyPickCounts {
  attractive: { count: number };
  breakout: { count: number };
  undervalue: { count: number };
  foreignAccumulation: { count: number };
}

const PICK_UNIVERSE = 'BBCA.JK,BBRI.JK,BMRI.JK,TLKM.JK,ASII.JK,GOTO.JK,ADRO.JK,ICBP.JK,ANTM.JK,UNTR.JK';

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

function formatNewsDate(pubDate: string): string {
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

export default function HomePage() {
  const [aiPicks, setAiPicks] = useState<AiPick[]>([]);
  const [ihsg, setIhsg] = useState<{ price: number; changePct: number } | null>(null);
  const [topGainers, setTopGainers] = useState<MarketMover[]>([]);
  const [topLosers, setTopLosers] = useState<MarketMover[]>([]);
  const [dailyPicks, setDailyPicks] = useState<DailyPickCounts | null>(null);
  // Menggantikan tampilan widget "Hari Ini AI Menemukan" (dailyPicks-nya sendiri TETAP
  // di-fetch di atas - masih dipakai payload /api/ai-briefing) - jadwal Corporate
  // Calendar terdekat belum ada baik di halaman ini maupun landing page "/".
  const [calendarEvents, setCalendarEvents] = useState<
    { date: string; symbol: string; type: 'DIVIDEND' | 'EARNINGS'; title: string }[] | null
  >(null);

  const [loadingMarket, setLoadingMarket] = useState(true);
  const [loadingPicks, setLoadingPicks] = useState(true);
  const [loadingDailyPicks, setLoadingDailyPicks] = useState(true);
  const [picksNeedPro, setPicksNeedPro] = useState(false);
  const [picksLoginRequired, setPicksLoginRequired] = useState(false);
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<{ title: string; link: string; source: string; sentiment: string; reason: string; pubDate: string }[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoPlan, setPromoPlan] = useState<'monthly' | 'annual'>('monthly');
  const [showPaywallFromPromo, setShowPaywallFromPromo] = useState(false);

  useEffect(() => {
    // Ringkasan pasar (IHSG + top gainer/loser) - publik, tanpa gerbang Pro, jadi
    // Beranda tidak lagi menampilkan teaser upgrade untuk sekadar lihat kondisi pasar.
    Promise.all([
      fetch('/api/live/^JKSE', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/market-summary', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([liveJkse, summary]) => {
        if (liveJkse) setIhsg({ price: liveJkse.price, changePct: liveJkse.changePercent });
        if (summary) {
          setTopGainers((summary.topGainers || []).slice(0, 10));
          setTopLosers((summary.topLosers || []).slice(0, 10));
        }
      })
      .finally(() => setLoadingMarket(false));

    fetch(`/api/recommendations?symbols=${PICK_UNIVERSE}`, { cache: 'no-store' })
      .then((r) => {
        if (r.status === 401) { setPicksLoginRequired(true); return null; }
        if (r.status === 402) { setPicksNeedPro(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d) => {
        const sorted = (d?.recommendations || []).sort((a: AiPick, b: AiPick) => b.confidence - a.confidence);
        setAiPicks(sorted.slice(0, 5));
      })
      .catch(() => {})
      .finally(() => setLoadingPicks(false));

    // "Hari Ini AI Menemukan" - publik (sama seperti widget di landing page /),
    // dipakai ulang di sini supaya Beranda terisi info pasar, bukan sekadar kosong
    // setelah Portfolio & Market Pulse dilepas dari halaman ini.
    fetch('/api/daily-picks', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setDailyPicks(d); })
      .catch(() => {})
      .finally(() => setLoadingDailyPicks(false));

    fetch('/api/news', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNewsItems(d?.items || []))
      .catch(() => {})
      .finally(() => setLoadingNews(false));

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

  const topPick = aiPicks.find((p) => p.consensus === 'STRONG BUY') || aiPicks[0];

  const handleClosePromo = useCallback(() => {
    markPromoSeenToday();
    setShowPromoModal(false);
  }, []);

  const handleSelectPlan = useCallback((plan: 'monthly' | 'annual') => {
    markPromoSeenToday();
    setPromoPlan(plan);
    setShowPromoModal(false);
    setShowPaywallFromPromo(true);
  }, []);

  // AI Experience: setelah semua data pasar siap, minta Gemini merangkai satu
  // paragraf naratif (bukan sekadar gabungan angka) - gagal diam-diam ke pesan
  // rule-based di bawah kalau API/GEMINI_API_KEY tidak tersedia. Murni ringkasan
  // pasar (bukan akun) - lihat catatan di app/api/ai-briefing/route.ts.
  useEffect(() => {
    if (loadingMarket || loadingPicks || loadingDailyPicks || aiBriefing) return;
    fetch('/api/ai-briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topPick: topPick ? { ticker: topPick.ticker, consensus: topPick.consensus, confidence: topPick.confidence } : null,
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
  }, [loadingMarket, loadingPicks, loadingDailyPicks]);

  const moverRowCount = Math.max(calendarEvents?.length || 0, 3);

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto w-full space-y-5 min-h-full flex flex-col">
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
                <h2 className="font-heading text-sm font-semibold text-white">AI Insight</h2>
                <Badge variant="info" dot>Live</Badge>
              </div>
              {loadingPicks ? (
                <p className="text-sm text-tv-muted mt-1.5 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Menganalisa pasar...
                </p>
              ) : aiBriefing ? (
                <p className="text-sm text-tv-text mt-1.5 leading-relaxed">{aiBriefing}</p>
              ) : picksLoginRequired ? (
                <p className="text-sm text-tv-muted mt-1.5">Login untuk melihat sinyal AI harian.</p>
              ) : picksNeedPro ? (
                <p className="text-sm text-tv-muted mt-1.5">Upgrade ke Pro untuk melihat sinyal AI harian.</p>
              ) : topPick ? (
                <p className="text-sm text-tv-text mt-1.5 leading-relaxed">
                  Sinyal AI hari ini: <span className="font-number font-semibold text-tv-blue">{topPick.ticker}</span>{' '}
                  <Badge variant={topPick.consensus.includes('BUY') ? 'success' : topPick.consensus.includes('SELL') ? 'danger' : 'neutral'} className="mx-1">
                    {topPick.consensus}
                  </Badge>
                  dengan confidence <span className="font-number font-semibold">{topPick.confidence}%</span>.
                </p>
              ) : (
                <p className="text-sm text-tv-muted mt-1.5">Belum ada sinyal kuat hari ini. Cek Stock Recommendations untuk detail lengkap.</p>
              )}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* moverRowCount: jumlah baris Top Gainer/Loser ikut jumlah baris Jadwal
          Terdekat di sebelahnya, biar dua kartu setinggi grid-stretch sama-sama
          terisi tanpa hardcode angka tetap. Minimal 3 baris kalau kalender kosong. */}
      <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Ringkasan Pasar - IHSG + top gainer/loser, publik (bukan Portfolio -
            SahamLens alat analisis/screener, bukan sekuritas; posisi trading ada
            di Akun Demo). Menggantikan card Portfolio yang sebelumnya di sini. */}
        <motion.div variants={fadeUp} className="h-full">
          <Card hoverable className="h-full flex flex-col">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-tv-purple" />
                <CardTitle>Ringkasan Pasar</CardTitle>
              </div>
              <Link href="/market-pulse" className="text-[11px] text-tv-blue hover:underline">Market Pulse</Link>
            </CardHeader>
            {loadingMarket ? (
              <div className="text-xs text-tv-muted py-4 text-center">Memuat...</div>
            ) : (
              <div className="space-y-3">
                <div className="bg-tv-bg/50 border border-tv-border rounded-md p-2.5">
                  <div className="text-[10px] text-tv-muted uppercase tracking-wide">IHSG</div>
                  {ihsg ? (
                    <div className="flex items-baseline gap-2">
                      <span className="font-number text-lg font-semibold text-white tabular-nums">{ihsg.price?.toLocaleString('id-ID')}</span>
                      <span className={`text-[12px] font-number flex items-center gap-0.5 ${ihsg.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                        {ihsg.changePct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {ihsg.changePct >= 0 ? '+' : ''}{ihsg.changePct.toFixed(2)}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-tv-muted">Data tidak tersedia</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] text-tv-muted uppercase tracking-wide mb-1">Top Gainer</div>
                    <div className="space-y-1">
                      {topGainers.slice(0, moverRowCount).map((s) => (
                        <div key={s.symbol} className="flex items-center justify-between text-xs">
                          <span className="font-medium text-tv-text font-number">{s.symbol}</span>
                          <span className="font-number text-tv-green tabular-nums">+{s.changePct.toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-tv-muted uppercase tracking-wide mb-1">Top Loser</div>
                    <div className="space-y-1">
                      {topLosers.slice(0, moverRowCount).map((s) => (
                        <div key={s.symbol} className="flex items-center justify-between text-xs">
                          <span className="font-medium text-tv-text font-number">{s.symbol}</span>
                          <span className="font-number text-tv-red tabular-nums">{s.changePct.toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Jadwal Corporate Calendar terdekat - menggantikan "Hari Ini AI Menemukan"
            yang isinya sama persis dengan widget "Rekomendasi AI Hari Ini" di landing
            page "/" (duplikat). Cakupan cuma Dividen & Earnings - Yahoo Finance tidak
            punya data RUPS/Stock Split IDX yang bisa diandalkan (lihat komentar di
            corporate-calendar.service.ts). */}
        <motion.div variants={fadeUp} className="h-full">
          <Card hoverable className="h-full flex flex-col">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-tv-gold" />
                <CardTitle>Jadwal Terdekat</CardTitle>
              </div>
              <Link href="/calendar" className="text-[11px] text-tv-blue hover:underline">Lihat Semua</Link>
            </CardHeader>
            {calendarEvents === null ? (
              <div className="text-xs text-tv-muted py-4 text-center">Memuat...</div>
            ) : calendarEvents.length === 0 ? (
              <p className="text-xs text-tv-muted py-4 text-center">Belum ada jadwal dalam waktu dekat.</p>
            ) : (
              <div className="space-y-2 flex-1">
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

      </motion.div>

      {/* Berita & Sentimen Pasar - RSS publik (CNBC Indonesia, Detik Finance) + sentimen
          dari Council AI (fallback heuristik kata kunci kalau Council AI tidak tersedia) */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex-1 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-tv-muted" />
              <CardTitle>Berita & Sentimen Pasar</CardTitle>
            </div>
            <Badge variant="info">Council AI</Badge>
          </CardHeader>

          {loadingNews ? (
            <div className="flex items-center gap-2 py-4 text-xs text-tv-muted">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat berita terkini...
            </div>
          ) : newsItems.length === 0 ? (
            <p className="text-xs text-tv-muted py-2">Berita tidak tersedia saat ini.</p>
          ) : (
            <>
              <div className="divide-y divide-tv-border/50">
                {newsItems.slice(0, 12).map((n) => (
                  <a
                    key={n.link || n.title}
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80 transition-opacity"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-tv-text leading-snug line-clamp-2">{n.title}</p>
                      <p className="text-[10px] text-tv-muted mt-1">{n.source} • {formatNewsDate(n.pubDate)} • {n.reason}</p>
                    </div>
                    <Badge
                      variant={n.sentiment === 'POSITIF' ? 'success' : n.sentiment === 'NEGATIF' ? 'danger' : 'neutral'}
                      className="shrink-0"
                    >
                      {n.sentiment}
                    </Badge>
                  </a>
                ))}
              </div>
              <Link
                href="/news"
                className="block text-center text-xs text-tv-blue hover:underline pt-3 mt-1 border-t border-tv-border/50"
              >
                Lihat Semua Berita
              </Link>
            </>
          )}
        </Card>
      </motion.div>

      <PromoUpgradeModal open={showPromoModal} onClose={handleClosePromo} onSelectPlan={handleSelectPlan} />
      <PaywallModal
        open={showPaywallFromPromo}
        onClose={() => setShowPaywallFromPromo(false)}
        title={promoPlan === 'annual' ? 'Upgrade ke Tahunan Pro' : 'Upgrade ke Bulanan Pro'}
        body={
          promoPlan === 'annual'
            ? 'Rp990.000/tahun - buka semua fitur Pro SahamLens, hemat setara 2 bulan dibanding bulanan.'
            : 'Rp99.000/bulan - buka semua fitur Pro SahamLens.'
        }
        benefits={[
          'Unlimited Technical Analyzer (10 filter)',
          'AI Pick LIVE, Council AI & Compare Tool',
          'Watchlist & Alert unlimited',
        ]}
        waText={
          promoPlan === 'annual'
            ? 'Halo, saya sudah transfer untuk upgrade ke SahamLens Pro TAHUNAN (Rp990.000/tahun). Ini bukti transfernya.'
            : 'Halo, saya sudah transfer untuk upgrade ke SahamLens Pro BULANAN (Rp99.000/bulan). Ini bukti transfernya.'
        }
      />
    </div>
  );
}
