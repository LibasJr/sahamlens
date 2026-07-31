'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, type Variants } from 'framer-motion';
import {
  Sparkles,
  Wallet,
  Bell,
  Activity,
  Target,
  Newspaper,
  Menu,
  ArrowUpRight,
  ArrowDownRight,
  Lock,
  Loader2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

const fmtRp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
};

interface HoldingDto {
  symbol: string;
  lots: number;
  avgPrice: number;
  totalCost: number;
}

interface PortfolioSummary {
  portfolio: { cash: number; initial_cash: number };
  holdings: HoldingDto[];
}

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
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItemDto[]>([]);
  const [indices, setIndices] = useState<any[]>([]);
  const [aiPicks, setAiPicks] = useState<AiPick[]>([]);

  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [loadingPulse, setLoadingPulse] = useState(true);
  const [loadingPicks, setLoadingPicks] = useState(true);
  const [pulseNeedsPro, setPulseNeedsPro] = useState(false);
  const [picksNeedPro, setPicksNeedPro] = useState(false);
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<{ title: string; link: string; source: string; sentiment: string; reason: string }[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);

  useEffect(() => {
    fetch('/api/v1/portfolio', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPortfolio(d))
      .catch(() => {})
      .finally(() => setLoadingPortfolio(false));

    fetch('/api/v1/watchlists', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWatchlist(d?.data || []))
      .catch(() => {})
      .finally(() => setLoadingWatchlist(false));

    fetch('/api/market-pulse', { cache: 'no-store' })
      .then((r) => {
        if (r.status === 402) { setPulseNeedsPro(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d) => setIndices(d?.indices || []))
      .catch(() => {})
      .finally(() => setLoadingPulse(false));

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

    fetch('/api/news', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNewsItems(d?.items || []))
      .catch(() => {})
      .finally(() => setLoadingNews(false));
  }, []);

  const totalCost = (portfolio?.holdings || []).reduce((sum, h) => sum + h.totalCost, 0);
  const cash = portfolio?.portfolio?.cash ?? 0;

  const topPick = aiPicks.find((p) => p.consensus === 'STRONG BUY') || aiPicks[0];

  // AI Experience: setelah semua data akun & pasar siap, minta Gemini merangkai
  // satu paragraf naratif (bukan sekadar gabungan angka) - gagal diam-diam ke
  // pesan rule-based di bawah kalau API/GEMINI_API_KEY tidak tersedia.
  useEffect(() => {
    if (loadingPortfolio || loadingPulse || loadingPicks || aiBriefing) return;
    fetch('/api/ai-briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cash,
        totalCost,
        holdingsCount: portfolio?.holdings?.length || 0,
        topPick: topPick ? { ticker: topPick.ticker, consensus: topPick.consensus, confidence: topPick.confidence } : null,
        indices: indices.map((i) => ({ name: i.name, changePct: i.changePct })),
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.briefing) setAiBriefing(d.briefing); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingPortfolio, loadingPulse, loadingPicks]);

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
            <p className="text-xs text-tv-muted mt-0.5">Ringkasan akun & pasar hari ini</p>
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
                  {totalCost > 0 && (
                    <>
                      {' '}Portofolio kamu saat ini {totalCost > 0 ? 'aktif dipantau' : ''} dengan {portfolio?.holdings.length} posisi terbuka.
                    </>
                  )}
                </p>
              ) : (
                <p className="text-sm text-tv-muted mt-1.5">Belum ada sinyal kuat hari ini. Cek Stock Recommendations untuk detail lengkap.</p>
              )}
            </div>
          </div>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Portfolio */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card hoverable>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-tv-green" />
                <CardTitle>Portfolio</CardTitle>
              </div>
              <Link href="/portfolio" className="text-[11px] text-tv-blue hover:underline">Lihat Detail</Link>
            </CardHeader>
            {loadingPortfolio ? (
              <div className="text-xs text-tv-muted py-4 text-center">Memuat...</div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] text-tv-muted uppercase tracking-wide">Cash</div>
                    <div className="font-number text-lg font-semibold text-white tabular-nums">
                      Rp <AnimatedNumber value={cash} />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-tv-muted uppercase tracking-wide">Total Modal Posisi</div>
                    <div className="font-number text-lg font-semibold text-white tabular-nums">
                      Rp <AnimatedNumber value={totalCost} />
                    </div>
                  </div>
                </div>
                {portfolio?.holdings?.length ? (
                  <div className="space-y-1.5 pt-1">
                    {portfolio.holdings.slice(0, 3).map((h) => (
                      <div key={h.symbol} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-tv-text">{h.symbol}</span>
                        <span className="font-number text-tv-muted tabular-nums">{h.lots} lot @ {fmtRp(h.avgPrice)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-tv-muted">Belum ada posisi terbuka. Mulai paper trading di Akun Demo.</p>
                )}
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

        {/* Market Pulse */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card hoverable>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-tv-purple" />
                <CardTitle>Market Pulse</CardTitle>
              </div>
              <Link href="/market-pulse" className="text-[11px] text-tv-blue hover:underline">Lihat Semua</Link>
            </CardHeader>
            {loadingPulse ? (
              <div className="text-xs text-tv-muted py-4 text-center">Memuat...</div>
            ) : pulseNeedsPro ? (
              <UpgradeTeaser label="Market Pulse" />
            ) : indices.length ? (
              <div className="grid grid-cols-2 gap-3">
                {indices.slice(0, 4).map((idx) => (
                  <div key={idx.name} className="bg-tv-bg/50 border border-tv-border rounded-md p-2.5">
                    <div className="text-[10px] text-tv-muted uppercase tracking-wide">{idx.name}</div>
                    <div className="font-number text-sm font-semibold text-white tabular-nums">{idx.price?.toLocaleString('id-ID')}</div>
                    <div className={`text-[11px] font-number flex items-center gap-0.5 ${idx.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                      {idx.changePct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {idx.changePct >= 0 ? '+' : ''}{idx.changePct}%
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-tv-muted">Data pasar belum tersedia.</p>
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
              <Link href="/recommendations" className="text-[11px] text-tv-blue hover:underline">Lihat Semua</Link>
            </CardHeader>
            {loadingPicks ? (
              <div className="text-xs text-tv-muted py-4 text-center">Memuat...</div>
            ) : picksNeedPro ? (
              <UpgradeTeaser label="Stock Recommendations" />
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
