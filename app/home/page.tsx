'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, type Variants } from 'framer-motion';
import {
  Sparkles,
  Bell,
  Activity,
  Target,
  Newspaper,
  Menu,
  ArrowUpRight,
  ArrowDownRight,
  Lock,
  Loader2,
  Flame,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const fmtRp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
};

interface WatchlistItemDto {
  symbol: string;
  buy_price: number | null;
  alert_price: number | null;
  lot: number | null;
}

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

function UpgradeTeaser({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-6">
      <Lock className="w-5 h-5 text-tv-gold" />
      <p className="text-xs text-tv-muted max-w-[220px]">{label} adalah fitur Pro.</p>
      <Link href="/watchlist">
        <Button variant="secondary" size="sm">Upgrade ke Pro</Button>
      </Link>
    </div>
  );
}

export default function HomePage() {
  const [watchlist, setWatchlist] = useState<WatchlistItemDto[]>([]);
  const [aiPicks, setAiPicks] = useState<AiPick[]>([]);
  const [ihsg, setIhsg] = useState<{ price: number; changePct: number } | null>(null);
  const [topGainers, setTopGainers] = useState<MarketMover[]>([]);
  const [topLosers, setTopLosers] = useState<MarketMover[]>([]);
  const [dailyPicks, setDailyPicks] = useState<DailyPickCounts | null>(null);

  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [loadingPicks, setLoadingPicks] = useState(true);
  const [loadingDailyPicks, setLoadingDailyPicks] = useState(true);
  const [picksNeedPro, setPicksNeedPro] = useState(false);
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<{ title: string; link: string; source: string; sentiment: string; reason: string }[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);

  useEffect(() => {
    fetch('/api/v1/watchlists', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWatchlist(d?.data || []))
      .catch(() => {})
      .finally(() => setLoadingWatchlist(false));

    // Ringkasan pasar (IHSG + top gainer/loser) - publik, tanpa gerbang Pro, jadi
    // Beranda tidak lagi menampilkan teaser upgrade untuk sekadar lihat kondisi pasar.
    Promise.all([
      fetch('/api/live/^JKSE', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/market-summary', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([liveJkse, summary]) => {
        if (liveJkse) setIhsg({ price: liveJkse.price, changePct: liveJkse.changePercent });
        if (summary) {
          setTopGainers((summary.topGainers || []).slice(0, 3));
          setTopLosers((summary.topLosers || []).slice(0, 3));
        }
      })
      .finally(() => setLoadingMarket(false));

    fetch(`/api/recommendations?symbols=${PICK_UNIVERSE}`, { cache: 'no-store' })
      .then((r) => {
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
  }, []);

  const topPick = aiPicks.find((p) => p.consensus === 'STRONG BUY') || aiPicks[0];

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

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto w-full space-y-5">
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
        <Card variant="default" padding="lg" className="border-tv-blue/30 bg-glow-blue shadow-2">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-tv-blue/15 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-tv-blue" />
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Ringkasan Pasar - IHSG + top gainer/loser, publik (bukan Portfolio -
            SahamLens alat analisis/screener, bukan sekuritas; posisi trading ada
            di Akun Demo). Menggantikan card Portfolio yang sebelumnya di sini. */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card hoverable>
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
                      {topGainers.map((s) => (
                        <div key={s.symbol} className="flex items-center justify-between text-xs">
                          <span className="font-medium text-tv-text">{s.symbol}</span>
                          <span className="font-number text-tv-green tabular-nums">+{s.changePct.toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-tv-muted uppercase tracking-wide mb-1">Top Loser</div>
                    <div className="space-y-1">
                      {topLosers.map((s) => (
                        <div key={s.symbol} className="flex items-center justify-between text-xs">
                          <span className="font-medium text-tv-text">{s.symbol}</span>
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

        {/* Watchlist */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card hoverable>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-tv-gold" />
                <CardTitle>Watchlist</CardTitle>
              </div>
              <Link href="/watchlist" className="text-[11px] text-tv-blue hover:underline">Kelola</Link>
            </CardHeader>
            {loadingWatchlist ? (
              <div className="text-xs text-tv-muted py-4 text-center">Memuat...</div>
            ) : watchlist.length ? (
              <div className="space-y-1.5">
                {watchlist.slice(0, 5).map((w) => (
                  <div key={w.symbol} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-tv-text">{w.symbol}</span>
                    <span className="font-number text-tv-muted tabular-nums">
                      {w.buy_price ? `Beli @ ${fmtRp(w.buy_price)}` : 'Tanpa harga beli'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-tv-muted">Watchlist kosong. Tambahkan saham untuk dipantau.</p>
            )}
          </Card>
        </motion.div>

        {/* Hari Ini AI Menemukan - dipakai ulang dari widget landing page publik,
            mengisi ruang yang sebelumnya Market Pulse (sudah punya menu sendiri
            di Sidebar, tidak perlu diduplikasi di sini). */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card hoverable>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-tv-gold" />
                <CardTitle>Hari Ini AI Menemukan</CardTitle>
              </div>
              <Link href="/breakout-radar" className="text-[11px] text-tv-blue hover:underline">Lihat Semua</Link>
            </CardHeader>
            {loadingDailyPicks ? (
              <div className="text-xs text-tv-muted py-4 text-center">Memuat...</div>
            ) : dailyPicks ? (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'attractive', label: 'Saham Menarik', href: '/breakout-radar?cat=attractive' },
                  { key: 'breakout', label: 'Breakout', href: '/breakout-radar' },
                  { key: 'undervalue', label: 'Undervalue', href: '/breakout-radar?cat=undervalue' },
                  { key: 'foreignAccumulation', label: 'Akumulasi Asing', href: '/breakout-radar?cat=foreignAccumulation' },
                ].map((row) => (
                  <Link
                    key={row.key}
                    href={row.href}
                    className="bg-tv-bg/50 border border-tv-border rounded-md p-2.5 hover:border-tv-borderLight transition-colors"
                  >
                    <div className="font-number text-lg font-semibold text-white tabular-nums">{(dailyPicks as any)[row.key]?.count ?? '-'}</div>
                    <div className="text-[10px] text-tv-muted">{row.label}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-tv-muted">Data belum tersedia.</p>
            )}
          </Card>
        </motion.div>

        {/* AI Picks */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card hoverable>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-tv-blue" />
                <CardTitle>AI Picks</CardTitle>
              </div>
              <Link href="/breakout-radar?cat=recommendations" className="text-[11px] text-tv-blue hover:underline">Lihat Semua</Link>
            </CardHeader>
            {loadingPicks ? (
              <div className="text-xs text-tv-muted py-4 text-center">Memuat...</div>
            ) : picksNeedPro ? (
              <UpgradeTeaser label="AI Pick" />
            ) : aiPicks.length ? (
              <div className="space-y-1.5">
                {aiPicks.map((p) => (
                  <div key={p.ticker} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-tv-text">{p.ticker}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={p.consensus.includes('BUY') ? 'success' : p.consensus.includes('SELL') ? 'danger' : 'neutral'}>
                        {p.consensus}
                      </Badge>
                      <span className="font-number text-tv-muted tabular-nums w-9 text-right">{p.confidence}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-tv-muted">Belum ada rekomendasi.</p>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Berita & Sentimen Pasar - RSS publik (CNBC Indonesia, Detik Finance) + sentimen
          dari Council AI (fallback heuristik kata kunci kalau Council AI tidak tersedia) */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <Card>
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
            <div className="divide-y divide-tv-border/50">
              {newsItems.slice(0, 6).map((n) => (
                <a
                  key={n.link || n.title}
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80 transition-opacity"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-tv-text leading-snug line-clamp-2">{n.title}</p>
                    <p className="text-[10px] text-tv-muted mt-1">{n.source} • {n.reason}</p>
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
          )}
        </Card>
      </motion.div>
    </div>
  );
}
