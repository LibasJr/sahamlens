# Homepage Redesign + TP/CL Ticker + Badge SEO Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Hapus badge "Yahoo Finance" di LensMarket. (2) Tukar isi root `/` dan `/home`: Gainer/Loser/Volume pindah ke `/home`, News pindah ke `/`. (3) Ganti panel "Sinyal Cross Hari Ini" jadi running-text vertikal TP1/TP2 (Golden Cross) / CL1/CL2 (Dead Cross) berbasis ATR-14.

**Architecture:** Ekstrak card grid dari `Dashboard.tsx` jadi komponen reusable `MarketMoverCard`, dipakai di 2 halaman. ATR-14 dihitung di `breakout.service.ts` dari OHLC yang sudah di-fetch (zero fetch tambahan), dialirkan lewat `CrossEntry` → cache → `daily-picks` API → `Dashboard.tsx`. Running text vertikal pakai pola CSS animation yang sama dengan `TickerTape` (horizontal) yang sudah ada, cuma sumbu translateY bukan translateX.

**Tech Stack:** Next.js/React/TypeScript, tidak ada dependency baru.

## Global Constraints

- Tidak ada perubahan route/URL.
- TP1/TP2/CL1/CL2 WAJIB null-safe di `daily-picks/route.ts` (cache lama tanpa field `atr` sampai cron berikutnya nimpa, TTL breakout-radar 3 hari) — dan di-filter di frontend supaya tidak ada baris dengan angka `undefined`/`NaN` tampil.
- Disclaimer TP/CL wajib ada ("Proyeksi ATR-14... bukan jaminan") — sesuai aturan anti-klaim-palsu brand doc.
- `app/fundamental/page.tsx` moduleBank "SMART AI" dan halaman lain di luar scope spec ini TIDAK disentuh.

---

### Task 1: Hapus badge "Yahoo Finance" di LensMarket

**Files:**
- Modify: `app/market-pulse/page.tsx:212-214`

**Interfaces:** Tidak ada. Independen dari task lain.

- [ ] **Step 1: Hapus blok badge**

```tsx
// SEBELUM
            {isClient && (
              <Badge variant="neutral">Update tiap 5 menit • Yahoo Finance</Badge>
            )}
// SESUDAH
            {/* dihapus - "Yahoo Finance" tidak perlu terekspos ke publik/SEO, freshness
                data sudah terwakili badge "Update: [jam]" di sebelah kanan. */}
```

- [ ] **Step 2: Verifikasi**

Run: `grep -n "Yahoo Finance" app/market-pulse/page.tsx`
Expected: no match.

Cek `Badge` masih dipakai di file ini (untuk import tidak jadi unused) — Run: `grep -c "Badge" app/market-pulse/page.tsx`, Expected: masih >0 (dipakai di tempat lain di file).

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` — Expected: 0 error baru.

```bash
git add app/market-pulse/page.tsx
git commit -m "fix(market-pulse): hapus badge Yahoo Finance, gak sesuai SEO"
```

---

### Task 2: Ekstrak `components/MarketMoverCard.tsx` + update `Dashboard.tsx`

**Files:**
- Create: `components/MarketMoverCard.tsx`
- Modify: `components/Dashboard.tsx`

**Interfaces:**
- Produces: `MarketMoverCard({ card: MoverCard, lastUpdated: string | null, loaded: boolean })` (React component), `formatCardItems(id: string, arr: any[]): CardItem[]`, `ACCENT_MAP`, types `CardItem`/`CardDef`/`MoverCard` — semua diimpor Task 3 (`/home`) dari `@/components/MarketMoverCard`.

- [ ] **Step 1: Buat `components/MarketMoverCard.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { fadeUp } from '@/lib/motion';

export type CardItem = { code: string; change: string; value: string; dir: 'up' | 'down' | 'neutral'; href: string };
export type CardDef = { id: string; title: string; sub: string; accent: string; Icon: any; key: string; listPath: string };
export type MoverCard = CardDef & { items: CardItem[] };

export const ACCENT_MAP: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  green: { bg: 'bg-tv-green/10', text: 'text-tv-green', border: 'border-tv-green/25', dot: 'bg-tv-green' },
  red: { bg: 'bg-tv-red/10', text: 'text-tv-red', border: 'border-tv-red/25', dot: 'bg-tv-red' },
  blue: { bg: 'bg-tv-blue/10', text: 'text-tv-blue', border: 'border-tv-blue/25', dot: 'bg-tv-blue' },
  purple: { bg: 'bg-tv-purple/10', text: 'text-tv-purple', border: 'border-tv-purple/25', dot: 'bg-tv-purple' },
  warning: { bg: 'bg-tv-warning/10', text: 'text-tv-warning', border: 'border-tv-warning/25', dot: 'bg-tv-warning' },
  slate: { bg: 'bg-tv-hover', text: 'text-tv-muted', border: 'border-tv-border', dot: 'bg-tv-muted' },
};

export function formatCardItems(id: string, arr: any[]): CardItem[] {
  return (arr || []).slice(0, 4).map((s: any) => {
    const href = `/technical/${s.symbol}.JK`;
    const priceStr = `Rp ${Math.round(s.price || 0).toLocaleString('id-ID')}`;
    switch (id) {
      case 'gainer':
        return { code: s.symbol, change: `+${s.changePct.toFixed(2)}%`, value: priceStr, dir: 'up', href };
      case 'loser':
        return { code: s.symbol, change: `${s.changePct.toFixed(2)}%`, value: priceStr, dir: 'down', href };
      case 'volume':
        return { code: s.symbol, change: `${Math.round(s.volume / 100).toLocaleString('id-ID')} lot`, value: priceStr, dir: 'neutral', href };
      case 'technical':
        return { code: s.symbol, change: `Skor ${s.score}%`, value: `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`, dir: 'up', href };
      case 'technicalBearish':
        return { code: s.symbol, change: `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`, value: priceStr, dir: 'down', href };
      case 'rsiOversold':
        return { code: s.symbol, change: `RSI ${s.rsi.toFixed(1)}`, value: `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`, dir: s.changePct >= 0 ? 'up' : 'down', href };
      default:
        return { code: s.symbol, change: '-', value: '-', dir: 'neutral', href };
    }
  });
}

export function MarketMoverCard({ card, lastUpdated, loaded }: { card: MoverCard; lastUpdated: string | null; loaded: boolean }) {
  const accent = ACCENT_MAP[card.accent] || ACCENT_MAP.slate;
  return (
    <motion.div variants={fadeUp} className="group relative rounded-lg border border-tv-border bg-tv-card p-5 shadow-1 hover:shadow-2 hover:-translate-y-0.5 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-lg grid place-items-center border ${accent.bg} ${accent.border} ${accent.text}`}>
            <card.Icon className="h-4 w-4" />
          </div>
          <div>
            <h4 className="font-heading text-[13px] font-bold leading-tight tracking-tight text-tv-text max-w-[180px]">{card.title}</h4>
            <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${accent.bg} ${accent.text}`}>{card.sub}</span>
          </div>
        </div>
        <span className={`h-2 w-2 rounded-full ${accent.dot}`} />
      </div>
      <div className="mt-4 divide-y divide-tv-border/60 rounded-lg border border-tv-border/60 overflow-hidden">
        {card.items.length === 0 && (
          <div className="bg-tv-card px-3 py-6 text-center text-[11px] text-tv-muted">
            {loaded ? 'Belum ada data untuk kategori ini' : 'Memuat data...'}
          </div>
        )}
        {card.items.map((it, idx) => (
          <Link key={it.code} href={it.href} className="flex items-center justify-between gap-2 bg-tv-card px-3 py-[11px] hover:bg-tv-hover transition">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-tv-surface text-[10px] font-bold text-white shrink-0">{idx + 1}</span>
              <span className="text-[12px] font-bold tracking-tight text-tv-text">{it.code}</span>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-[12px] font-bold tracking-tight flex items-center justify-end gap-1 font-number ${it.dir === 'down' ? 'text-tv-red' : it.dir === 'up' ? 'text-tv-green' : 'text-tv-text'}`}>
                {it.dir !== 'neutral' && <span className={`h-1 w-1 rounded-full ${it.dir === 'down' ? 'bg-tv-red' : 'bg-tv-green'}`} />}
                {it.change}
              </div>
              <div className="text-[10px] font-medium text-tv-muted">{it.value}</div>
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-tv-muted">Update {lastUpdated || '--:--'} • IDX</span>
        <Link href={card.listPath} className="inline-flex items-center gap-1 text-[11px] font-bold text-tv-blue hover:text-tv-text transition">
          Lihat Seluruhnya <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: `components/Dashboard.tsx` — ganti import, hapus type/ACCENT_MAP/formatCardItems lokal**

```tsx
// SEBELUM (baris 1-11)
'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, BarChart3, ChevronRight, ArrowUpRight, ArrowDownRight, Sparkles, Activity } from 'lucide-react';
import TradingViewChart from '@/components/TradingViewChart';
import CommandPalette from '@/components/CommandPalette';
import { computeIndicators, generateInsight, computeMiniCouncil, type Indicators } from '@/lib/miniCouncil';
import { SegmentedControl } from '@/components/ui';
import { fadeUp, staggerContainer } from '@/lib/motion';
// SESUDAH
'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, BarChart3, ArrowUpRight, ArrowDownRight, Sparkles, Activity } from 'lucide-react';
import TradingViewChart from '@/components/TradingViewChart';
import CommandPalette from '@/components/CommandPalette';
import { computeIndicators, generateInsight, computeMiniCouncil, type Indicators } from '@/lib/miniCouncil';
import { SegmentedControl } from '@/components/ui';
import { fadeUp, staggerContainer } from '@/lib/motion';
import { MarketMoverCard, formatCardItems, type CardDef } from '@/components/MarketMoverCard';
```

(`ChevronRight` dihapus dari import lucide-react karena cuma dipakai di card grid lama yang sekarang ada di `MarketMoverCard.tsx` — kalau typecheck Step 6 nanti nunjukkin `ChevronRight` masih dipakai di tempat lain file ini, batalkan penghapusan ini dan biarkan tetap diimpor.)

- [ ] **Step 3: Hapus `CardItem`/`CardDef`/`Card` type lokal dan `CARD_DEFS` diperkecil**

```tsx
// SEBELUM (baris 13-24)
type CardItem = { code: string; change: string; value: string; dir: 'up' | 'down' | 'neutral'; href: string };
type CardDef = { id: string; title: string; sub: string; accent: string; Icon: any; key: string; listPath: string };
type Card = CardDef & { items: CardItem[] };

const CARD_DEFS: CardDef[] = [
  { id: 'gainer', title: 'Saham dengan Kenaikan Tertinggi', sub: 'Top Gainer', accent: 'green', Icon: TrendingUp, key: 'topGainers', listPath: '/market/top-gainer' },
  { id: 'loser', title: 'Saham dengan Penurunan Terdalam', sub: 'Top Loser', accent: 'red', Icon: TrendingDown, key: 'topLosers', listPath: '/market/top-loser' },
  { id: 'volume', title: 'Berdasarkan Volume Lembar Saham', sub: 'Top Volume • Lot', accent: 'slate', Icon: BarChart3, key: 'topVolume', listPath: '/market/top-volume' },
  { id: 'technical', title: 'Sinyal Teknikal Bullish (MA20 > MA50)', sub: 'Technical Signal', accent: 'purple', Icon: Sparkles, key: 'topTechnical', listPath: '/market/technical-bullish' },
  { id: 'technicalBearish', title: 'Sinyal Teknikal Bearish (MA20 < MA50)', sub: 'Technical Signal', accent: 'red', Icon: TrendingDown, key: 'topTechnicalBearish', listPath: '/market/technical-bearish' },
  { id: 'rsiOversold', title: 'RSI Oversold (Potensi Rebound)', sub: 'RSI (14) Terendah', accent: 'warning', Icon: Activity, key: 'topRsiOversold', listPath: '/market/rsi-oversold' },
];
// SESUDAH
const CARD_DEFS: CardDef[] = [
  { id: 'technical', title: 'Sinyal Teknikal Bullish (MA20 > MA50)', sub: 'Technical Signal', accent: 'purple', Icon: Sparkles, key: 'topTechnical', listPath: '/market/technical-bullish' },
  { id: 'technicalBearish', title: 'Sinyal Teknikal Bearish (MA20 < MA50)', sub: 'Technical Signal', accent: 'red', Icon: TrendingDown, key: 'topTechnicalBearish', listPath: '/market/technical-bearish' },
  { id: 'rsiOversold', title: 'RSI Oversold (Potensi Rebound)', sub: 'RSI (14) Terendah', accent: 'warning', Icon: Activity, key: 'topRsiOversold', listPath: '/market/rsi-oversold' },
];
```

- [ ] **Step 4: Hapus `formatCardItems` lokal (baris 28-55 versi lama) dan `ACCENT_MAP` lokal (baris 134-140 versi lama)** — dua blok ini dihapus total, sudah pindah ke `MarketMoverCard.tsx` (Step 1).

- [ ] **Step 5: Tambah state + fetch News, setelah state `crossSignals` yang sudah ada (dekat baris 283, sebelum `React.useEffect` fetch daily-picks)**

```typescript
  const [newsItems, setNewsItems] = useState<{ title: string; link: string; source: string; sentiment: string; pubDate: string }[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);

  React.useEffect(() => {
    fetch('/api/news', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNewsItems((d?.items || []).slice(0, 6)))
      .catch(() => {})
      .finally(() => setLoadingNews(false));
  }, []);
```

- [ ] **Step 6: Ganti `marketCards.map(...)` grid — pakai `MarketMoverCard`, tambah card News**

```tsx
// SEBELUM
          {marketCards.map((card) => {
            const accent = ACCENT_MAP[card.accent] || ACCENT_MAP.slate;

            return (
              <motion.div
                key={card.id}
                variants={fadeUp}
                className="group relative rounded-lg border border-tv-border bg-tv-card p-5 shadow-1 hover:shadow-2 hover:-translate-y-0.5 transition-all"
              >
                {/* header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-lg grid place-items-center border ${accent.bg} ${accent.border} ${accent.text}`}>
                      <card.Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-heading text-[13px] font-bold leading-tight tracking-tight text-tv-text max-w-[180px]">{card.title}</h4>
                      <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${accent.bg} ${accent.text}`}>{card.sub}</span>
                    </div>
                  </div>
                  <span className={`h-2 w-2 rounded-full ${accent.dot}`} />
                </div>

                {/* list */}
                <div className="mt-4 divide-y divide-tv-border/60 rounded-lg border border-tv-border/60 overflow-hidden">
                  {card.items.length === 0 && (
                    <div className="bg-tv-card px-3 py-6 text-center text-[11px] text-tv-muted">
                      {cardsLoaded ? 'Belum ada data untuk kategori ini' : 'Memuat data...'}
                    </div>
                  )}
                  {card.items.map((it, idx) => (
                    <Link key={it.code} href={it.href} className="flex items-center justify-between gap-2 bg-tv-card px-3 py-[11px] hover:bg-tv-hover transition">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-tv-surface text-[10px] font-bold text-white shrink-0">{idx+1}</span>
                        <div className="min-w-0">
                          <span className="text-[12px] font-bold tracking-tight text-tv-text">{it.code}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-[12px] font-bold tracking-tight flex items-center justify-end gap-1 font-number ${it.dir === 'down' ? 'text-tv-red' : it.dir === 'up' ? 'text-tv-green' : 'text-tv-text'}`}>
                          {it.dir !== 'neutral' && <span className={`h-1 w-1 rounded-full ${it.dir === 'down' ? 'bg-tv-red' : 'bg-tv-green'}`} />}
                          {it.change}
                        </div>
                        <div className="text-[10px] font-medium text-tv-muted">{it.value}</div>
                      </div>
                    </Link>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-tv-muted">Update {lastUpdated || '--:--'} • IDX</span>
                  <Link href={card.listPath} className="inline-flex items-center gap-1 text-[11px] font-bold text-tv-blue hover:text-tv-text transition">
                    Lihat Seluruhnya <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </motion.div>
            );
          })}
// SESUDAH
          {marketCards.map((card) => (
            <MarketMoverCard key={card.id} card={card} lastUpdated={lastUpdated} loaded={cardsLoaded} />
          ))}
          <motion.div variants={fadeUp} className="rounded-lg border border-tv-border bg-tv-card p-5 shadow-1">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-heading text-[13px] font-bold text-tv-text">Berita Terkini</h4>
              <Link href="/news" className="text-[11px] font-bold text-tv-blue hover:text-tv-text transition">Lihat Semua</Link>
            </div>
            <div className="mt-4 divide-y divide-tv-border/60">
              {newsItems.length === 0 ? (
                <div className="px-1 py-6 text-center text-[11px] text-tv-muted">{loadingNews ? 'Memuat berita...' : 'Belum ada berita'}</div>
              ) : (
                newsItems.map((n) => (
                  <a key={n.link || n.title} href={n.link} target="_blank" rel="noopener noreferrer" className="block py-2.5 first:pt-0 last:pb-0 hover:opacity-80 transition-opacity">
                    <p className="text-[12px] font-medium text-tv-text leading-snug line-clamp-2">{n.title}</p>
                    <p className="text-[10px] text-tv-muted mt-1">{n.source}</p>
                  </a>
                ))
              )}
            </div>
          </motion.div>
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 error baru. Kalau ada error "X is declared but never used" untuk `ChevronRight`, konfirmasi dulu apakah masih dipakai di bagian lain `Dashboard.tsx` (mis. di panel "Rekomendasi LensRadar" baris ~530) — kalau masih dipakai, jangan hapus importnya di Step 2 (revert bagian itu).

- [ ] **Step 8: Commit**

```bash
git add components/MarketMoverCard.tsx components/Dashboard.tsx
git commit -m "refactor(home): ekstrak MarketMoverCard, root / buang Gainer/Loser/Volume tambah News"
```

---

### Task 3: `/home` — buang News, tambah Gainer/Loser/Volume

**Files:**
- Modify: `app/home/page.tsx`

**Interfaces:**
- Consumes: `MarketMoverCard`, `formatCardItems`, `type CardDef` dari `@/components/MarketMoverCard` (Task 2).

- [ ] **Step 1: Baca ulang `app/home/page.tsx` import saat ini untuk cek `TrendingUp`/`TrendingDown`/`BarChart3` sudah ada atau belum**

Run: `grep -n "TrendingUp\|TrendingDown\|BarChart3" app/home/page.tsx` — kalau belum ada, tambah ke import `lucide-react` di Step 2. Import yang SUDAH ada di file ini (baris 6-15): `Sparkles, Activity, Newspaper, Menu, ArrowUpRight, ArrowDownRight, Loader2, Flame`.

- [ ] **Step 2: Tambah import + hapus `Newspaper`/`Loader2` kalau sudah tidak dipakai setelah Step 4-5**

```tsx
// SEBELUM (baris 1-20)
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
import { PRICING_PLANS, FULL_FEATURE_LIST, formatRupiah, type PricingPlan } from '@/shared/config/pricing';
// SESUDAH
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Activity,
  Menu,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { fadeUp, staggerContainer } from '@/lib/motion';
import PromoUpgradeModal from '@/components/PromoUpgradeModal';
import PaywallModal from '@/components/PaywallModal';
import { PRICING_PLANS, FULL_FEATURE_LIST, formatRupiah, type PricingPlan } from '@/shared/config/pricing';
import { MarketMoverCard, formatCardItems, type CardDef } from '@/components/MarketMoverCard';
```

(`Newspaper`/`Loader2` dihapus karena cuma dipakai di card Berita yang dihapus Step 5 — kalau typecheck Step 8 nunjukkin masih dipakai di tempat lain, batalkan penghapusan itu.)

- [ ] **Step 3: Hapus helper `formatNewsDate` (baris 61-65) dan interface `MarketMover` diperluas dengan `volume`**

```tsx
// SEBELUM (baris 30-34)
interface MarketMover {
  symbol: string;
  changePct: number;
  price: number;
}
// SESUDAH
interface MarketMover {
  symbol: string;
  changePct: number;
  price: number;
  volume?: number;
}
```

Hapus fungsi `formatNewsDate` (baris 61-65) total.

- [ ] **Step 4: State — hapus `newsItems`/`loadingNews`, tambah `topVolume`**

```tsx
// SEBELUM (baris 70-71, 86-87)
  const [topGainers, setTopGainers] = useState<MarketMover[]>([]);
  const [topLosers, setTopLosers] = useState<MarketMover[]>([]);
  ...
  const [newsItems, setNewsItems] = useState<{ title: string; link: string; source: string; sentiment: string; reason: string; pubDate: string }[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);
// SESUDAH
  const [topGainers, setTopGainers] = useState<MarketMover[]>([]);
  const [topLosers, setTopLosers] = useState<MarketMover[]>([]);
  const [topVolume, setTopVolume] = useState<MarketMover[]>([]);
```

- [ ] **Step 5: Fetch — tambah `topVolume`, hapus fetch `/api/news`**

```tsx
// SEBELUM (baris 99-106)
      .then(([liveJkse, summary]) => {
        if (liveJkse) setIhsg({ price: liveJkse.price, changePct: liveJkse.changePercent });
        if (summary) {
          setTopGainers((summary.topGainers || []).slice(0, 10));
          setTopLosers((summary.topLosers || []).slice(0, 10));
        }
      })
      .finally(() => setLoadingMarket(false));
// SESUDAH
      .then(([liveJkse, summary]) => {
        if (liveJkse) setIhsg({ price: liveJkse.price, changePct: liveJkse.changePercent });
        if (summary) {
          setTopGainers((summary.topGainers || []).slice(0, 10));
          setTopLosers((summary.topLosers || []).slice(0, 10));
          setTopVolume((summary.topVolume || []).slice(0, 10));
        }
      })
      .finally(() => setLoadingMarket(false));
```

Hapus blok fetch `/api/news` (baris 130-134):
```tsx
// DIHAPUS
    fetch('/api/news', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNewsItems(d?.items || []))
      .catch(() => {})
      .finally(() => setLoadingNews(false));
```

- [ ] **Step 6: Sederhanakan card "LensMarket" — hapus grid 2-kolom Gainer/Loser (baris 297-320)**

```tsx
// SEBELUM (baris 282-321, isi dalam `{loadingMarket ? ... : (...)}`)
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
// SESUDAH
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
```

(`moverRowCount` masih dipakai kartu "Jadwal Terdekat" di sebelahnya — JANGAN dihapus variabelnya, cuma pemakaian di card LensMarket ini yang hilang.)

- [ ] **Step 7: Ganti card "Berita & Sentimen Pasar" (baris 373-424) jadi grid 3 card Gainer/Loser/Volume**

```tsx
// SEBELUM
      {/* Berita & Sentimen Pasar - RSS publik (CNBC Indonesia, Detik Finance) + sentimen
          dari LensAI (fallback heuristik kata kunci kalau LensAI tidak tersedia) */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex-1 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-tv-muted" />
              <CardTitle>Berita & Sentimen Pasar</CardTitle>
            </div>
            <Badge variant="info">LensAI</Badge>
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
// SESUDAH
      {(() => {
        const HOME_CARD_DEFS: CardDef[] = [
          { id: 'gainer', title: 'Saham dengan Kenaikan Tertinggi', sub: 'Top Gainer', accent: 'green', Icon: TrendingUp, key: 'gainer', listPath: '/market/top-gainer' },
          { id: 'loser', title: 'Saham dengan Penurunan Terdalam', sub: 'Top Loser', accent: 'red', Icon: TrendingDown, key: 'loser', listPath: '/market/top-loser' },
          { id: 'volume', title: 'Berdasarkan Volume Lembar Saham', sub: 'Top Volume • Lot', accent: 'slate', Icon: BarChart3, key: 'volume', listPath: '/market/top-volume' },
        ];
        const homeCards = HOME_CARD_DEFS.map((def) => ({
          ...def,
          items: formatCardItems(def.id, def.id === 'gainer' ? topGainers : def.id === 'loser' ? topLosers : topVolume),
        }));
        return (
          <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
            {homeCards.map((card) => (
              <MarketMoverCard key={card.id} card={card} lastUpdated={null} loaded={!loadingMarket} />
            ))}
          </motion.div>
        );
      })()}
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 error baru. Kalau `Newspaper`/`Loader2`/`Badge` dilaporkan unused, cek dulu apakah masih dipakai bagian lain file (mis. `Badge` dipakai juga di card "Jadwal Terdekat" baris 355-357 — JANGAN dihapus importnya).

- [ ] **Step 9: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): buang card Berita, tambah Gainer/Loser/Volume (gaya sama kayak yang dihapus dari /)"
```

---

### Task 4: Backend ATR-14 + TP1/TP2/CL1/CL2

**Files:**
- Modify: `modules/recommendation/service/breakout.service.ts`
- Modify: `app/api/daily-picks/route.ts`

**Interfaces:**
- Produces: `CrossEntry.atr: number | null`, response fields `goldenCross.detail[].tp1/tp2`, `deadCross.detail[].cl1/cl2` (semua `number | null`) — dikonsumsi Task 5.

- [ ] **Step 1: `breakout.service.ts` — tambah field `atr` ke `RawSymbolSignal` dan `CrossEntry`**

```typescript
// SEBELUM (baris 22-26)
export interface CrossEntry {
  symbol: string;
  price: number;
  change: string;
}
// SESUDAH
export interface CrossEntry {
  symbol: string;
  price: number;
  change: string;
  atr: number | null;
}
```

```typescript
// SEBELUM (baris 28-37)
interface RawSymbolSignal {
  symbol: string;
  currentPrice: number;
  changeStr: string;
  isCrossUp: boolean;
  isDeadCross: boolean;
  score: number;
  signals: string[];
  rr: string;
}
// SESUDAH
interface RawSymbolSignal {
  symbol: string;
  currentPrice: number;
  changeStr: string;
  isCrossUp: boolean;
  isDeadCross: boolean;
  score: number;
  signals: string[];
  rr: string;
  atr: number | null;
}
```

- [ ] **Step 2: Hitung ATR-14 di `analyzeSymbolForBreakout`, setelah blok `rr` (baris 133-136), sebelum `return`**

```typescript
// SEBELUM (baris 133-147)
    const low20 = Math.min(...history.slice(-20).map(h => h.low));
    const risk = currentPrice - low20;
    const reward = high20 - currentPrice;
    const rr = risk > 0 ? (reward / risk).toFixed(1) : '0';

    return {
      symbol,
      currentPrice,
      changeStr: (((currentPrice - closes[closes.length - 2]) / closes[closes.length - 2]) * 100).toFixed(2) + '%',
      isCrossUp,
      isDeadCross,
      score,
      signals,
      rr: `1:${rr}`,
    };
// SESUDAH
    const low20 = Math.min(...history.slice(-20).map(h => h.low));
    const risk = currentPrice - low20;
    const reward = high20 - currentPrice;
    const rr = risk > 0 ? (reward / risk).toFixed(1) : '0';

    // ATR-14 (Average True Range) - dasar hitung TP1/TP2 (Golden Cross) / CL1/CL2 (Dead
    // Cross) di app/api/daily-picks/route.ts. `history` di sini sudah dijamin >=51 bar
    // (guard di atas), jauh lebih dari 15 yang dibutuhkan ATR-14 - tidak perlu fetch
    // tambahan. Formula True Range sama dengan modules/technical/service/analyzers/
    // volatility-analyzer.ts (sudah dipercaya di tempat lain, bukan rumus baru dikarang).
    let trSum = 0;
    for (let i = history.length - 14; i < history.length; i++) {
      const high = history[i].high;
      const low = history[i].low;
      const prevClose = history[i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trSum += tr;
    }
    const atr = trSum / 14;

    return {
      symbol,
      currentPrice,
      changeStr: (((currentPrice - closes[closes.length - 2]) / closes[closes.length - 2]) * 100).toFixed(2) + '%',
      isCrossUp,
      isDeadCross,
      score,
      signals,
      rr: `1:${rr}`,
      atr,
    };
```

- [ ] **Step 3: `scanCrossSignals()` — bawa `atr` ke `CrossEntry`**

```typescript
// SEBELUM (baris 189)
    const entry = { symbol: r.symbol, price: r.currentPrice, change: r.changeStr };
// SESUDAH
    const entry = { symbol: r.symbol, price: r.currentPrice, change: r.changeStr, atr: r.atr };
```

- [ ] **Step 4: `app/api/daily-picks/route.ts` — tambah `tp1`/`tp2`/`cl1`/`cl2`**

```typescript
// SEBELUM (baris 74-75)
      goldenCross: { ...category(crossSignals.golden, (s: any) => ({ symbol: s.symbol.replace('.JK', ''), price: s.price, changePct: parseFloat(s.change), metric: 'Golden Cross' })), stale: breakoutStale, asOf: breakoutAsOf },
      deadCross: { ...category(crossSignals.dead, (s: any) => ({ symbol: s.symbol.replace('.JK', ''), price: s.price, changePct: parseFloat(s.change), metric: 'Dead Cross' })), stale: breakoutStale, asOf: breakoutAsOf },
// SESUDAH
      goldenCross: { ...category(crossSignals.golden, (s: any) => ({
        symbol: s.symbol.replace('.JK', ''),
        price: s.price,
        changePct: parseFloat(s.change),
        metric: 'Golden Cross',
        tp1: typeof s.atr === 'number' ? Math.round(s.price + s.atr) : null,
        tp2: typeof s.atr === 'number' ? Math.round(s.price + 2 * s.atr) : null,
      })), stale: breakoutStale, asOf: breakoutAsOf },
      deadCross: { ...category(crossSignals.dead, (s: any) => ({
        symbol: s.symbol.replace('.JK', ''),
        price: s.price,
        changePct: parseFloat(s.change),
        metric: 'Dead Cross',
        cl1: typeof s.atr === 'number' ? Math.round(s.price - s.atr) : null,
        cl2: typeof s.atr === 'number' ? Math.round(s.price - 2 * s.atr) : null,
      })), stale: breakoutStale, asOf: breakoutAsOf },
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 error baru.

- [ ] **Step 6: Unit sanity check manual (bukan test file baru - cek logic ATR sekali via node REPL)**

Run:
```bash
node -e "
const history = Array.from({length: 20}, (_, i) => ({ high: 100+i, low: 95+i, close: 98+i }));
let trSum = 0;
for (let i = history.length - 14; i < history.length; i++) {
  const high = history[i].high, low = history[i].low, prevClose = history[i-1].close;
  const tr = Math.max(high-low, Math.abs(high-prevClose), Math.abs(low-prevClose));
  trSum += tr;
}
console.log('ATR14:', trSum/14);
"
```
Expected: output angka wajar (untuk data sintetis ini, TR per hari konstan ~5-6 karena high-low=5 dan gap antar hari close~1, ATR14 hasilnya harus mendekati 5-6, bukan 0/NaN/negatif) — validasi manual formula sebelum dipercaya masuk production.

- [ ] **Step 7: Commit**

```bash
git add modules/recommendation/service/breakout.service.ts app/api/daily-picks/route.ts
git commit -m "feat(breakout): hitung ATR-14 dari OHLC yang sudah di-fetch, expose TP1/TP2/CL1/CL2 di daily-picks"
```

---

### Task 5: Frontend — `VerticalSignalTicker` ganti panel "Sinyal Cross Hari Ini"

**Files:**
- Modify: `components/Dashboard.tsx`

**Interfaces:**
- Consumes: `data.goldenCross.detail[].tp1/tp2`, `data.deadCross.detail[].cl1/cl2` dari `/api/daily-picks` (Task 4).

- [ ] **Step 1: Perluas tipe + mapping state `crossSignals` (baris 280-299), filter null**

```tsx
// SEBELUM
  const [crossSignals, setCrossSignals] = useState<{
    golden: { symbol: string; price: number }[];
    dead: { symbol: string; price: number }[];
  } | null>(null);

  React.useEffect(() => {
    fetch('/api/daily-picks')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || data.error) {
          setCrossSignals({ golden: [], dead: [] });
          return;
        }
        setCrossSignals({
          golden: (data.goldenCross?.detail || []).map((d: any) => ({ symbol: d.symbol, price: d.price })),
          dead: (data.deadCross?.detail || []).map((d: any) => ({ symbol: d.symbol, price: d.price })),
        });
      })
      .catch(() => setCrossSignals({ golden: [], dead: [] }));
  }, []);
// SESUDAH
  const [crossSignals, setCrossSignals] = useState<{
    golden: { symbol: string; price: number; tp1: number; tp2: number }[];
    dead: { symbol: string; price: number; cl1: number; cl2: number }[];
  } | null>(null);

  React.useEffect(() => {
    fetch('/api/daily-picks')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || data.error) {
          setCrossSignals({ golden: [], dead: [] });
          return;
        }
        setCrossSignals({
          golden: (data.goldenCross?.detail || [])
            .filter((d: any) => d.tp1 != null && d.tp2 != null)
            .map((d: any) => ({ symbol: d.symbol, price: d.price, tp1: d.tp1, tp2: d.tp2 })),
          dead: (data.deadCross?.detail || [])
            .filter((d: any) => d.cl1 != null && d.cl2 != null)
            .map((d: any) => ({ symbol: d.symbol, price: d.price, cl1: d.cl1, cl2: d.cl2 })),
        });
      })
      .catch(() => setCrossSignals({ golden: [], dead: [] }));
  }, []);
```

- [ ] **Step 2: Tambah komponen `VerticalSignalTicker`, letakkan tepat setelah definisi `TickerTape` (setelah baris `}` penutup `TickerTape`, sebelum `const ACCENT_MAP`... — CATATAN: `ACCENT_MAP` sudah dihapus di Task 2, jadi taruh sebelum baris berikutnya yang tersisa setelah `TickerTape`, cek konteks aktual file saat mengerjakan step ini)**

```tsx
// Running text vertikal - level TP1/TP2 (Golden Cross) / CL1/CL2 (Dead Cross) berbasis
// ATR-14 (lihat breakout.service.ts + app/api/daily-picks/route.ts). Pola sama dengan
// TickerTape di atas (translate + duplikasi list 2x untuk loop mulus, pause on hover),
// cuma sumbu Y bukan X.
function VerticalSignalTicker({ golden, dead }: {
  golden: { symbol: string; price: number; tp1: number; tp2: number }[];
  dead: { symbol: string; price: number; cl1: number; cl2: number }[];
}) {
  const items = [
    ...golden.map((s) => ({ ...s, type: 'golden' as const })),
    ...dead.map((s) => ({ ...s, type: 'dead' as const })),
  ];
  if (!items.length) {
    return <p className="text-[11px] text-tv-muted py-4 text-center flex-1">Belum ada sinyal TP/CL hari ini.</p>;
  }
  const loopItems = [...items, ...items];
  const durationSec = Math.max(20, Math.round(items.length * 2.5));
  return (
    <div className="relative flex-1 overflow-hidden min-h-[120px]">
      <div className="sahamlens-vticker-track flex flex-col" style={{ animationDuration: `${durationSec}s` }}>
        {loopItems.map((s, i) => (
          <Link
            key={`${s.type}-${s.symbol}-${i}`}
            href={`/technical/${s.symbol}.JK`}
            className="flex items-center justify-between gap-2 px-3 py-2 border-b border-tv-border/40 hover:bg-tv-hover/40 transition-colors shrink-0"
          >
            <span className="text-[12px] font-bold font-number text-tv-text">{s.symbol}</span>
            <span className="text-[11px] font-number text-tv-muted">Rp {Math.round(s.price).toLocaleString('id-ID')}</span>
            {s.type === 'golden' ? (
              <span className="text-[10px] font-bold font-number text-tv-green">TP1 {s.tp1.toLocaleString('id-ID')} • TP2 {s.tp2.toLocaleString('id-ID')}</span>
            ) : (
              <span className="text-[10px] font-bold font-number text-tv-red">CL1 {s.cl1.toLocaleString('id-ID')} • CL2 {s.cl2.toLocaleString('id-ID')}</span>
            )}
          </Link>
        ))}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .sahamlens-vticker-track { animation-name: sahamlens-vticker-scroll; animation-timing-function: linear; animation-iteration-count: infinite; }
        .sahamlens-vticker-track:hover { animation-play-state: paused; }
        @keyframes sahamlens-vticker-scroll { from { transform: translateY(0); } to { transform: translateY(-50%); } }
      `}} />
    </div>
  );
}
```

- [ ] **Step 3: Ganti isi panel "Sinyal Cross Hari Ini" (baris 537-594)**

```tsx
// SEBELUM
              {/* Sinyal Golden Cross / Dead Cross - beda dari skor komposit di atas, murni
                  kejadian crossover MA20/MA50 hari ini. Tanpa gembok Premium: siapa pun yang
                  sampai di beranda dan melihat panel ini sudah lolos gerbang Pro/trial di
                  /api/ai-pick di atasnya, mengunci lagi tidak ada gunanya. */}
              <div className="mt-5 pt-4 border-t border-tv-border flex-1 flex flex-col">
                <h4 className="font-heading text-[12px] font-bold text-tv-text flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-tv-green" />
                  Sinyal Cross Hari Ini
                </h4>
                {/* justify-between (bukan gap tetap) - panel kanan ini disamakan tingginya
                    dengan chart di kiri lewat grid items-stretch, dan jumlah sinyal
                    cross harian tidak tentu (bisa 1, bisa 6). gap tetap menyisakan ruang
                    kosong menganggur di bawah kalau sinyalnya sedikit; justify-between
                    menyebar baris yang ADA merata mengisi tinggi yang tersedia, berapa
                    pun jumlahnya. */}
                <div className="mt-3 flex-1 flex flex-col justify-between gap-2">
                  {crossSignals === null ? (
                    <p className="text-[11px] text-tv-muted py-4 text-center">Memuat sinyal...</p>
                  ) : crossSignals.golden.length === 0 && crossSignals.dead.length === 0 ? (
                    <p className="text-[11px] text-tv-muted py-4 text-center">
                      Belum ada Golden/Dead Cross baru hari ini.
                    </p>
                  ) : (
                    <>
                      {crossSignals.golden.map((s) => (
                        <Link
                          key={`golden-${s.symbol}`}
                          href={`/technical/${s.symbol}.JK`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-tv-border/60 bg-tv-card px-3 py-2 hover:border-tv-borderLight transition-colors"
                        >
                          <span className="text-[13px] font-bold font-number text-tv-text">{s.symbol}</span>
                          <span className="text-[11px] font-number text-tv-muted">
                            Rp {Math.round(s.price).toLocaleString('id-ID')}
                          </span>
                          <span className="text-[10px] font-bold text-tv-green bg-tv-green/15 rounded px-1.5 py-0.5">
                            Golden Cross
                          </span>
                        </Link>
                      ))}
                      {crossSignals.dead.map((s) => (
                        <Link
                          key={`dead-${s.symbol}`}
                          href={`/technical/${s.symbol}.JK`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-tv-border/60 bg-tv-card px-3 py-2 hover:border-tv-borderLight transition-colors"
                        >
                          <span className="text-[13px] font-bold font-number text-tv-text">{s.symbol}</span>
                          <span className="text-[11px] font-number text-tv-muted">
                            Rp {Math.round(s.price).toLocaleString('id-ID')}
                          </span>
                          <span className="text-[10px] font-bold text-tv-red bg-tv-red/15 rounded px-1.5 py-0.5">
                            Dead Cross
                          </span>
                        </Link>
                      ))}
                    </>
                  )}
                </div>
              </div>
// SESUDAH
              {/* Sinyal TP/CL - proyeksi ATR-14 dari Golden/Dead Cross hari ini, running
                  text vertikal (lihat VerticalSignalTicker). Tanpa gembok Premium, sama
                  seperti sebelumnya. */}
              <div className="mt-5 pt-4 border-t border-tv-border flex-1 flex flex-col">
                <h4 className="font-heading text-[12px] font-bold text-tv-text flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-tv-green" />
                  Sinyal TP/CL Hari Ini
                </h4>
                <p className="text-[10px] text-tv-muted mt-1">
                  Proyeksi ATR-14 dari sinyal Golden/Dead Cross - bukan jaminan harga akan tercapai.
                </p>
                {crossSignals === null ? (
                  <p className="text-[11px] text-tv-muted py-4 text-center flex-1">Memuat sinyal...</p>
                ) : (
                  <VerticalSignalTicker golden={crossSignals.golden} dead={crossSignals.dead} />
                )}
              </div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 error baru.

- [ ] **Step 5: Commit**

```bash
git add components/Dashboard.tsx
git commit -m "feat(home): ganti panel Sinyal Cross Hari Ini jadi running text vertikal TP1/TP2/CL1/CL2"
```

---

### Task 6: Verifikasi akhir

**Files:** tidak ada file diubah.

- [ ] **Step 1: Typecheck** — Run: `npx tsc --noEmit` — Expected: 0 error.
- [ ] **Step 2: Lint** — Run: `npm run lint` — Expected: 0 error baru (warning pre-existing boleh).
- [ ] **Step 3: Test** — Run: `npm test` — Expected: 185 test tetap pass (atau lebih kalau ada test baru di task lain sesi ini).
- [ ] **Step 4: Build** — Run: `npm run build` — Expected: build sukses.

- [ ] **Step 5: Grep sapu bersih**

```bash
grep -n "Yahoo Finance" app/market-pulse/page.tsx  # expect: no match
grep -n "Sinyal Cross Hari Ini" components/Dashboard.tsx  # expect: no match
grep -n "Berita & Sentimen Pasar" app/home/page.tsx  # expect: no match
grep -c "MarketMoverCard" components/Dashboard.tsx app/home/page.tsx  # expect: >0 di kedua file
```

- [ ] **Step 6: Manual smoke test** (`npm run dev`, buka browser)

- `/` — grid card cuma 4 (technical/technicalBearish/rsiOversold/Berita Terkini), Gainer/Loser/Volume TIDAK ADA lagi di grid. Panel kanan Featured Chart: running text vertikal jalan otomatis, pause pas di-hover, klik baris masuk `/technical/{symbol}.JK`, disclaimer ATR-14 kelihatan.
- `/home` — card Berita hilang total. Card "LensMarket" cuma nampilin IHSG (gainer/loser lama hilang dari situ). 3 card baru (Gainer/Loser/Volume) muncul, gaya visualnya identik sama yang dulu ada di `/`.
- `/market-pulse` — badge "Yahoo Finance" hilang, badge "Update: [jam]" masih ada.
- Bandingkan 1 saham Golden Cross di running text: TP1/TP2 yang tampil = harga saat itu ± 1x/2x ATR-14 (cek ATR saham yang sama di `/dashboard?ticker={symbol}` filter LensTechnical "Volatility (ATR 14)").

Kalau ada regresi, perbaiki dengan commit fix terpisah sebelum lapor selesai.
