# UI/UX BUILD 001 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `/home` hierarchy (surface hidden AI Picks data, add a
LensRadar section, collapse Market Movers into tabs), add a LensRadar rank
badge + relocated freshness label to `/dashboard`, wire already-computed
server freshness metadata into the UI, replace silent loading/error states
with `Skeleton`/`EmptyState`, add branding subtitles to 3 pages, and do a
code-review mobile pass — all UI/data-wiring only, no API or scoring-logic
changes.

**Architecture:** Pure presentation-layer changes on top of the existing
Next.js 14 App Router + Nucleus design system (`components/ui/*`). No new
API routes. All new sections consume endpoints that already exist and, in
most cases, are already fetched by the page but partially unused
(`aiPicks` in `/home`) or under-wired (`lastUpdated={null}` hardcoded).

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind
(Nucleus tokens), Framer Motion (`lib/motion.ts` variants), Vitest.

## Global Constraints

- No new API routes, no changes to scoring/business logic in `modules/*`.
- No changes to `components/Sidebar.tsx` structure (13 items stay as-is).
- No changes to `/dashboard`'s Hero→LensScore→Chart→LensFlow order (see
  spec section C — explicit prior BUILD 004 decision, confirmed to keep).
- No status taxonomy invention — LensRadar has no EARLY/WATCH/BREAKOUT/
  ACCUMULATION/DISTRIBUTION concept in this codebase; use the real
  ranked-score-and-reasons data from `/api/ai-pick` instead (spec section A
  correction).
- Reuse existing `components/ui/*` primitives (`Card`, `Badge`, `Skeleton`,
  `EmptyState`, `SegmentedControl`) — do not create parallel ad-hoc markup.
- Every loading state must resolve to SUCCESS, ERROR, or EMPTY — no
  indefinite spinners.
- Indonesian UI copy throughout (matches existing pages).
- Spec doc: `docs/superpowers/specs/2026-08-04-uiux-build-001-foundation-design.md`.

---

## Task 1: Freshness label utility (TDD)

Small pure function shared by `/home`'s new freshness labels (Task 7) and
reused as-is — the only new non-trivial pure logic in this build, so it's
the one place a unit test earns its keep (spec "Testing" section).

**Files:**
- Create: `lib/utils/freshness-label.ts`
- Test: `lib/utils/__tests__/freshness-label.test.ts`

**Interfaces:**
- Produces: `formatFreshnessLabel(input: { freshness?: 'FRESH' | 'CACHED' | 'STALE' | 'DELAYED' | 'EOD' | 'UNKNOWN' | null; timeLabel?: string | null }): { text: string; stale: boolean }` — consumed by Task 7 (`/home`) and Task 10 (`/dashboard`, optional reuse).

- [ ] **Step 1: Write the failing test**

```ts
// lib/utils/__tests__/freshness-label.test.ts
import { describe, it, expect } from 'vitest';
import { formatFreshnessLabel } from '../freshness-label';

describe('formatFreshnessLabel', () => {
  it('formats a fresh cache-based label without a stale flag', () => {
    const result = formatFreshnessLabel({ freshness: 'FRESH', timeLabel: '14:32 WIB' });
    expect(result).toEqual({ text: 'Updated 14:32 WIB', stale: false });
  });

  it('formats a cached (not stale) label', () => {
    const result = formatFreshnessLabel({ freshness: 'CACHED', timeLabel: '14:20 WIB' });
    expect(result).toEqual({ text: 'Updated 14:20 WIB', stale: false });
  });

  it('flags STALE as stale and appends the warning sentence', () => {
    const result = formatFreshnessLabel({ freshness: 'STALE', timeLabel: '11:05 WIB' });
    expect(result).toEqual({
      text: 'Updated 11:05 WIB • Data mungkin sudah tidak terbaru.',
      stale: true,
    });
  });

  it('treats market-time DELAYED/EOD as not stale, only STALE/UNKNOWN as stale', () => {
    expect(formatFreshnessLabel({ freshness: 'DELAYED', timeLabel: '14:32 WIB' }).stale).toBe(false);
    expect(formatFreshnessLabel({ freshness: 'EOD', timeLabel: '16:00 WIB' }).stale).toBe(false);
    expect(formatFreshnessLabel({ freshness: 'UNKNOWN', timeLabel: null }).stale).toBe(true);
  });

  it('falls back to a neutral label when there is no timestamp yet', () => {
    const result = formatFreshnessLabel({ freshness: null, timeLabel: null });
    expect(result).toEqual({ text: 'Memuat waktu update...', stale: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/utils/__tests__/freshness-label.test.ts`
Expected: FAIL with "Cannot find module '../freshness-label'"

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/utils/freshness-label.ts
export type FreshnessValue = 'FRESH' | 'CACHED' | 'STALE' | 'DELAYED' | 'EOD' | 'UNKNOWN';

interface FormatFreshnessLabelInput {
  freshness?: FreshnessValue | null;
  timeLabel?: string | null;
}

interface FreshnessLabelResult {
  text: string;
  stale: boolean;
}

const STALE_VALUES: ReadonlySet<FreshnessValue> = new Set(['STALE', 'UNKNOWN']);

export function formatFreshnessLabel({ freshness, timeLabel }: FormatFreshnessLabelInput): FreshnessLabelResult {
  if (!timeLabel) {
    return { text: 'Memuat waktu update...', stale: false };
  }
  const stale = freshness != null && STALE_VALUES.has(freshness);
  const text = stale
    ? `Updated ${timeLabel} • Data mungkin sudah tidak terbaru.`
    : `Updated ${timeLabel}`;
  return { text, stale };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/utils/__tests__/freshness-label.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/utils/freshness-label.ts lib/utils/__tests__/freshness-label.test.ts
git commit -m "feat(uiux): add formatFreshnessLabel utility for BUILD 001 freshness labels"
```

---

## Task 2: `/home` — Today's Opportunities section

`aiPicks` is already fetched (`app/home/page.tsx:109-120`, from
`/api/recommendations?symbols=${PICK_UNIVERSE}`) but only used to derive
`topPick` for the AI briefing sentence — never rendered as a list. This
task renders it.

**Files:**
- Modify: `app/home/page.tsx`

**Interfaces:**
- Consumes: existing `aiPicks: AiPick[]` state (`{ ticker, price, changePct, consensus, confidence }`), existing `loadingPicks`, `picksLoginRequired`, `picksNeedPro` state — all already defined at `app/home/page.tsx:67-89`.

- [ ] **Step 1: Add the section, right after the AI Insight hero `motion.div` (after line 254's closing `</motion.div>`, before the two-column `motion.div` at line 256)**

```tsx
      {/* Today's Opportunities - aiPicks sudah di-fetch di atas tapi sebelumnya
          cuma dipakai untuk derive topPick di briefing text, tidak pernah
          dirender sebagai list sendiri (audit BUILD 001). */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-tv-green" />
              <CardTitle>Today&apos;s Opportunities</CardTitle>
            </div>
            <Link href="/breakout-radar" className="text-[11px] text-tv-blue hover:underline">LensRadar</Link>
          </CardHeader>
          {loadingPicks ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : picksLoginRequired ? (
            <EmptyState title="Login untuk melihat LensAI Picks" description="Sinyal AI harian butuh akun." />
          ) : picksNeedPro ? (
            <EmptyState title="Fitur Pro" description="Upgrade ke Pro untuk melihat LensAI Picks harian." />
          ) : aiPicks.length === 0 ? (
            <EmptyState title="Belum ada peluang kuat hari ini" description="Coba cek lagi nanti setelah jam bursa berjalan." />
          ) : (
            <div className="space-y-2">
              {aiPicks.slice(0, 5).map((p) => (
                <Link
                  key={p.ticker}
                  href={`/technical/${p.ticker}.JK`}
                  className="flex items-center justify-between gap-3 bg-tv-bg/50 border border-tv-border rounded-md px-3 py-2.5 hover:border-tv-borderLight transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-number text-sm font-bold text-white shrink-0">{p.ticker}</span>
                    <Badge variant={p.consensus.includes('BUY') ? 'success' : p.consensus.includes('SELL') ? 'danger' : 'neutral'}>
                      {p.consensus}
                    </Badge>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-number text-sm font-semibold text-white">LensScore {p.confidence}%</div>
                    <div className={`text-[11px] font-number ${p.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                      {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(2)}%
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </motion.div>
```

- [ ] **Step 2: Add `Skeleton`, `EmptyState` to the existing `components/ui` import**

```tsx
// app/home/page.tsx:18 — before:
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
// after:
import { Card, CardHeader, CardTitle, Badge, Skeleton, EmptyState } from '@/components/ui';
```

- [ ] **Step 3: Verify it compiles and renders**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npm run dev` (if not already running), open `http://localhost:3001/home` while logged in, confirm a "Today's Opportunities" card appears above the LensMarket/Jadwal row showing ticker/consensus/LensScore rows (or the EmptyState/Skeleton depending on auth+load state).

- [ ] **Step 4: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): surface LensAI Picks as visible Today's Opportunities section"
```

---

## Task 3: `/home` — LensRadar section

Replaces the generic "Sinyal Teknikal Bullish" (MA20>MA50) card in the
right column of the two-column row (`app/home/page.tsx:340-353`) with a
real LensRadar section backed by `/api/ai-pick` (ranked score + reasons —
see spec correction, no status enum exists in this codebase).

**Files:**
- Modify: `app/home/page.tsx`

**Interfaces:**
- Produces (new local type): `RadarPick = { symbol: string; finalScore: number; topReasons?: string[]; flagged: boolean; flagReason: string | null }` (subset of `AiPickItem` from `app/breakout-radar/page.tsx` — only the fields this section renders).
- Consumes: `/api/ai-pick` GET → `{ ready: boolean; items: AiPickItem[]; computedAt: string | null; stale: boolean; note: string | null }` (same endpoint `app/breakout-radar/page.tsx` calls, confirmed shape at `app/api/ai-pick/route.ts:59-65`).

- [ ] **Step 1: Add radar state near the other `useState` calls (after `app/home/page.tsx:79`, the `calendarEvents` state)**

```tsx
  const [radarItems, setRadarItems] = useState<
    { symbol: string; finalScore: number; topReasons?: string[]; flagged: boolean; flagReason: string | null }[]
  >([]);
  const [loadingRadar, setLoadingRadar] = useState(true);
  const [radarError, setRadarError] = useState(false);
```

- [ ] **Step 2: Add the fetch — new `useEffect` placed right after the existing calendar-fetch `useEffect` (after the one ending at `app/home/page.tsx:147`, before the `useEffect` at line 150 that checks the user profile)**

```tsx
  const fetchRadar = useCallback(() => {
    setLoadingRadar(true);
    setRadarError(false);
    fetch('/api/ai-pick', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) { setRadarError(true); return; }
        setRadarItems((d.items || []).slice(0, 5));
      })
      .catch(() => setRadarError(true))
      .finally(() => setLoadingRadar(false));
  }, []);

  useEffect(() => {
    fetchRadar();
  }, [fetchRadar]);
```

- [ ] **Step 3: Replace the `MarketMoverCard` "technical" block (`app/home/page.tsx:338-353`) with a LensRadar card**

```tsx
// before (app/home/page.tsx:338-353):
        {/* Sinyal Teknikal Bullish - dipindah dari landing page "/" (components/
            Dashboard.tsx), ngisi slot bekas Jadwal Terdekat di kolom kanan. */}
        <MarketMoverCard
          card={{
            id: 'technical',
            title: 'Sinyal Teknikal Bullish (MA20 > MA50)',
            sub: 'Technical Signal',
            accent: 'purple',
            Icon: Sparkles,
            key: 'technical',
            listPath: '/market/technical-bullish',
            items: formatCardItems('technical', topTechnical),
          }}
          lastUpdated={null}
          loaded={!loadingMarket}
        />

// after:
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
                  className="flex items-center justify-between gap-2 bg-tv-bg/50 border border-tv-border rounded-md px-3 py-2 hover:border-tv-borderLight transition-colors"
                >
                  <div className="min-w-0">
                    <span className="font-number text-sm font-bold text-white">{it.symbol.replace('.JK', '')}</span>
                    {it.flagged && <span className="ml-2 text-tv-red text-[10px]">! {it.flagReason}</span>}
                    <div className="text-[10px] text-tv-muted truncate">{it.topReasons?.[0] || '-'}</div>
                  </div>
                  <span className="font-number text-sm font-semibold text-white shrink-0">{it.finalScore}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
```

- [ ] **Step 4: Add `Radar` and `useCallback` (already imported) to the lucide import list at `app/home/page.tsx:6-17`**

```tsx
// before:
import {
  Sparkles,
  Activity,
  Menu,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Flame,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from 'lucide-react';
// after:
import {
  Sparkles,
  Activity,
  Menu,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Flame,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Radar,
} from 'lucide-react';
```

`useCallback` is already imported at `app/home/page.tsx:3`. `Sparkles` is
still used elsewhere in the file (AI Insight hero icon) — do not remove it
even though this task removes its use in the deleted technical-signal card.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — expected: no new errors.
Manual: reload `/home`, confirm the right column of the second row now
shows "LensRadar" with ranked symbols/scores instead of "Sinyal Teknikal
Bullish".

- [ ] **Step 6: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): replace generic MA20>MA50 card with real LensRadar section (ranked score+reasons from /api/ai-pick)"
```

---

## Task 4: `/home` — Market Movers as tabs

Collapses the Gainer/Loser/Volume 3-card grid (`app/home/page.tsx:356-376`)
into a single card with `SegmentedControl` tabs, shortening the page per
spec principle "reduce long sections with tabs/grouping."

**Files:**
- Modify: `app/home/page.tsx`

**Interfaces:**
- Consumes: existing `topGainers`, `topLosers`, `topVolume: MarketMover[]` state, existing `formatCardItems`/`MarketMoverCard`/`CardDef` from `components/MarketMoverCard.tsx` (already imported at `app/home/page.tsx:23`).

- [ ] **Step 1: Add a local tab-state near the other `useState` calls (after Task 3's `radarError` state)**

```tsx
  const [moversTab, setMoversTab] = useState<'gainer' | 'loser' | 'volume'>('gainer');
```

- [ ] **Step 2: Replace the 3-card grid IIFE (`app/home/page.tsx:359-376`) with a single tabbed card**

```tsx
// before:
      {/* Gainer/Loser/Volume - gaya sama persis dengan card yang sebelumnya ada di
          landing page "/" (components/Dashboard.tsx), sekarang dipindah ke sini,
          ditukar dengan card Berita yang pindah ke "/". */}
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

// after:
      {/* Market Movers - dulu 3 card grid (Gainer/Loser/Volume) sekaligus, sekarang
          1 card ber-tab (spec BUILD 001: kurangi section panjang dengan tabs) -
          MarketMoverCard & formatCardItems tidak berubah, cuma dipilih satu per waktu. */}
      {(() => {
        const MOVERS_DEFS: Record<'gainer' | 'loser' | 'volume', CardDef> = {
          gainer: { id: 'gainer', title: 'Saham dengan Kenaikan Tertinggi', sub: 'Top Gainer', accent: 'green', Icon: TrendingUp, key: 'gainer', listPath: '/market/top-gainer' },
          loser: { id: 'loser', title: 'Saham dengan Penurunan Terdalam', sub: 'Top Loser', accent: 'red', Icon: TrendingDown, key: 'loser', listPath: '/market/top-loser' },
          volume: { id: 'volume', title: 'Berdasarkan Volume Lembar Saham', sub: 'Top Volume • Lot', accent: 'slate', Icon: BarChart3, key: 'volume', listPath: '/market/top-volume' },
        };
        const sourceData = moversTab === 'gainer' ? topGainers : moversTab === 'loser' ? topLosers : topVolume;
        const activeCard: MoverCard = { ...MOVERS_DEFS[moversTab], items: formatCardItems(moversTab, sourceData) };
        return (
          <motion.div initial="hidden" animate="show" variants={fadeUp} className="space-y-3">
            <SegmentedControl
              layoutId="home-movers-tab"
              value={moversTab}
              onChange={(v) => setMoversTab(v as 'gainer' | 'loser' | 'volume')}
              options={[
                { label: 'Top Gainer', value: 'gainer' },
                { label: 'Top Loser', value: 'loser' },
                { label: 'Top Volume', value: 'volume' },
              ]}
            />
            <MarketMoverCard card={activeCard} lastUpdated={null} loaded={!loadingMarket} />
          </motion.div>
        );
      })()}
```

- [ ] **Step 3: Update imports — `app/home/page.tsx:18` and `:23`**

```tsx
// line 18, before:
import { Card, CardHeader, CardTitle, Badge, Skeleton, EmptyState } from '@/components/ui';
// after (add SegmentedControl):
import { Card, CardHeader, CardTitle, Badge, Skeleton, EmptyState, SegmentedControl } from '@/components/ui';

// line 23, before:
import { MarketMoverCard, formatCardItems, type CardDef } from '@/components/MarketMoverCard';
// after (add MoverCard type):
import { MarketMoverCard, formatCardItems, type CardDef, type MoverCard } from '@/components/MarketMoverCard';
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — expected: no new errors.
Manual: reload `/home`, confirm one "Market Movers" card with 3 tabs
(Top Gainer/Top Loser/Top Volume) replaces the old 3-card grid, and
switching tabs swaps the list without a full page reload.

- [ ] **Step 5: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): collapse Gainer/Loser/Volume 3-card grid into one tabbed card"
```

---

## Task 5: `/home` — LensScanner teaser + LensWatch section

Adds the two remaining missing sections from spec item 1's homepage
structure: a small LensScanner CTA (not a full embedded table — spec
explicitly says teaser only) and a LensWatch summary (watchlist count),
empty-state if the user has none.

**Files:**
- Modify: `app/home/page.tsx`

**Interfaces:**
- Consumes: `/api/watchlist` GET → `{ data: { symbol: string; buy_price: number; lot?: number; created_at: string }[] }` (same endpoint/shape `app/watchlist/page.tsx:70-80` already uses).

- [ ] **Step 1: Add watchlist state + fetch (after Task 3's `radarError` / Task 4's `moversTab` state block)**

```tsx
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null);
  const [watchlistPreview, setWatchlistPreview] = useState<{ symbol: string }[]>([]);

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
```

- [ ] **Step 2: Append both sections at the end of the page body, right before the closing `<PromoUpgradeModal .../>` line (`app/home/page.tsx:378`)**

```tsx
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
```

- [ ] **Step 3: Add `Filter`, `Eye` to the lucide import list at `app/home/page.tsx:6-18` (from Task 3, now includes `Radar`)**

```tsx
// after (final import list for this file):
import {
  Sparkles,
  Activity,
  Menu,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Flame,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Radar,
  Filter,
  Eye,
} from 'lucide-react';
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — expected: no new errors.
Manual: reload `/home`, confirm a "LensScanner" teaser card and a
"LensWatch" card appear at the bottom, above the promo/paywall modals.
Test both watchlist states (empty account vs. one with saved symbols).

- [ ] **Step 5: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): add LensScanner teaser and LensWatch summary sections"
```

---

## Task 6: `/home` — wire real freshness into Market Movers / LensMarket / LensRadar

Uses Task 1's `formatFreshnessLabel`. `MarketMoverCard` already accepts
`lastUpdated` — every call site in `/home` currently hardcodes `null`
(confirmed at lines 353, 372 pre-Task-3/4 — now the single call site added
in Task 4). `/api/market-summary` already returns `_meta.freshness` (see
spec section F correction); `/api/live/^JKSE` already returns `freshness`
+ `lastUpdate`.

**Files:**
- Modify: `app/home/page.tsx`

**Interfaces:**
- Consumes: `formatFreshnessLabel` from Task 1, `/api/market-summary`'s `_meta: { freshness: 'FRESH'|'CACHED'|'STALE'; cachedAgeSec: number; cacheTtlSec: number }`, `/api/live/^JKSE`'s `freshness: 'DELAYED'|'EOD'|'STALE'|'UNKNOWN'` + `lastUpdate: string` (ISO).

- [ ] **Step 1: Capture the raw freshness values from the existing market fetch (`app/home/page.tsx:94-107`)**

```tsx
// before:
    Promise.all([
      fetch('/api/live/^JKSE', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/market-summary', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([liveJkse, summary]) => {
        if (liveJkse) setIhsg({ price: liveJkse.price, changePct: liveJkse.changePercent });
        if (summary) {
          setTopGainers((summary.topGainers || []).slice(0, 10));
          setTopLosers((summary.topLosers || []).slice(0, 10));
          setTopVolume((summary.topVolume || []).slice(0, 10));
          setTopTechnical((summary.topTechnical || []).slice(0, 10));
        }
      })
      .finally(() => setLoadingMarket(false));

// after:
    Promise.all([
      fetch('/api/live/^JKSE', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/market-summary', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([liveJkse, summary]) => {
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
          setMoversFreshness(summary._meta?.freshness ?? null);
          setMoversTimeLabel(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB');
        }
      })
      .finally(() => setLoadingMarket(false));
```

- [ ] **Step 2: Add the 4 new state variables next to `ihsg` state (`app/home/page.tsx:68`)**

```tsx
  const [ihsgFreshness, setIhsgFreshness] = useState<string | null>(null);
  const [ihsgTimeLabel, setIhsgTimeLabel] = useState<string | null>(null);
  const [moversFreshness, setMoversFreshness] = useState<string | null>(null);
  const [moversTimeLabel, setMoversTimeLabel] = useState<string | null>(null);
```

- [ ] **Step 3: Render the LensMarket freshness label — inside the LensMarket `Card` (`app/home/page.tsx:274-288`), directly under the IHSG price row**

```tsx
// after the closing </div> of the IHSG price block (after line 287's </div>, still inside the `) : (` branch), add:
                  <p className={`text-[10px] mt-1.5 ${formatFreshnessLabel({ freshness: ihsgFreshness as any, timeLabel: ihsgTimeLabel }).stale ? 'text-tv-warning' : 'text-tv-muted'}`}>
                    {formatFreshnessLabel({ freshness: ihsgFreshness as any, timeLabel: ihsgTimeLabel }).text}
                  </p>
```

- [ ] **Step 4: Pass real freshness into the Market Movers `MarketMoverCard` call added in Task 4**

```tsx
// Task 4's line:
            <MarketMoverCard card={activeCard} lastUpdated={null} loaded={!loadingMarket} />
// becomes:
            <MarketMoverCard card={activeCard} lastUpdated={moversTimeLabel} loaded={!loadingMarket} />
```

`MarketMoverCard` already renders `Update {lastUpdated || '--:--'} • IDX` —
no component change needed, this task only supplies the real value. If
`moversFreshness === 'STALE'`, the plain "Update HH:MM" label is left as-is
(the component has no stale-styling slot); do not modify
`components/MarketMoverCard.tsx` in this task — out of scope, cosmetic-only
gap, acceptable since the raw timestamp itself is still accurate and not
mislabeled as live.

- [ ] **Step 5: Import `formatFreshnessLabel` at the top of `app/home/page.tsx`**

```tsx
import { formatFreshnessLabel } from '@/lib/utils/freshness-label';
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` — expected: no new errors.
Manual: reload `/home`, confirm the LensMarket card shows "Updated HH:MM
WIB" under the IHSG price, and the Market Movers card's footer shows a
real time instead of "--:--".

- [ ] **Step 7: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): wire already-computed API freshness metadata into LensMarket and Market Movers"
```

---

## Task 7: `/home` — Skeleton loading states

Replaces the plain "Memuat..." text spots in `/home` with `Skeleton`
blocks shaped like the final content (spec item 4).

**Files:**
- Modify: `app/home/page.tsx`

- [ ] **Step 1: LensMarket loading branch (`app/home/page.tsx:271-273`)**

```tsx
// before:
              {loadingMarket ? (
                <div className="text-xs text-tv-muted py-4 text-center">Memuat...</div>
              ) : (
// after:
              {loadingMarket ? (
                <div className="bg-tv-bg/50 border border-tv-border rounded-md p-2.5 space-y-2">
                  <Skeleton variant="text" className="w-16" />
                  <Skeleton className="h-6 w-32" />
                </div>
              ) : (
```

- [ ] **Step 2: Jadwal Terdekat loading branch (`app/home/page.tsx:306-307`)**

```tsx
// before:
              {calendarEvents === null ? (
                <div className="text-xs text-tv-muted py-4 text-center">Memuat...</div>
              ) : calendarEvents.length === 0 ? (
// after:
              {calendarEvents === null ? (
                <div className="space-y-2">
                  {[0, 1].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : calendarEvents.length === 0 ? (
```

- [ ] **Step 3: AI Insight hero loading branch (`app/home/page.tsx:230-233`) — replace the inline spinner with a text-shaped skeleton**

```tsx
// before:
              {loadingPicks ? (
                <p className="text-sm text-tv-muted mt-1.5 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Menganalisa pasar...
                </p>
              ) : aiBriefing ? (
// after:
              {loadingPicks ? (
                <div className="mt-1.5 space-y-1.5">
                  <Skeleton variant="text" className="w-full max-w-md" />
                  <Skeleton variant="text" className="w-2/3 max-w-xs" />
                </div>
              ) : aiBriefing ? (
```

`Loader2` import stays — still referenced elsewhere is not the case here,
so remove it from the lucide import list only if a project-wide search
confirms no other use in this file (check with `grep -n "Loader2" app/home/page.tsx` before removing; if it only appears in the block just replaced, delete it from the import list to avoid an unused-import lint warning).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` && `npm run lint` — expected: no new errors/warnings
(confirms the `Loader2` import cleanup in Step 3 was handled correctly
either way).
Manual: throttle network in devtools, reload `/home`, confirm shimmer
skeletons appear briefly instead of "Memuat..." text.

- [ ] **Step 5: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): replace Memuat... text with layout-shaped Skeleton loading states"
```

---

## Task 8: `/home` — explicit ERROR states with retry

Currently `LensMarket`/`Market Movers` fetch failures are swallowed
(`.catch(() => null)` at `app/home/page.tsx:95-96`) — on failure the
section just renders its already-handled "Data tidak tersedia" (IHSG only)
or empty grid, with no retry action. This task adds a real ERROR state
distinct from EMPTY, per spec item 5.

**Files:**
- Modify: `app/home/page.tsx`

- [ ] **Step 1: Track fetch success/failure separately from "no data yet" — add state next to `loadingMarket` (`app/home/page.tsx:81`)**

```tsx
  const [marketError, setMarketError] = useState(false);
```

- [ ] **Step 2: Extract the market fetch into a named, retriable function and set the error flag on total failure. Replace the whole `useEffect` block that starts the `Promise.all([...])` for `/api/live` + `/api/market-summary` (from Task 6's Step 1) with:**

```tsx
  const fetchMarket = useCallback(() => {
    setLoadingMarket(true);
    setMarketError(false);
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
          setMoversFreshness(summary._meta?.freshness ?? null);
          setMoversTimeLabel(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB');
        }
      })
      .finally(() => setLoadingMarket(false));
  }, []);

  useEffect(() => {
    fetchMarket();
  }, [fetchMarket]);
```

(This subsumes Task 6 Step 1 — if executing tasks in order, edit the
`fetchMarket` version directly instead of writing Task 6's inline
`Promise.all` first.)

- [ ] **Step 3: Render the error state — wrap the LensMarket card body (`app/home/page.tsx:271` onward) with a `marketError` branch, and pass it into the Market Movers section from Task 4**

```tsx
// LensMarket card body, before the existing loadingMarket ternary:
              {marketError ? (
                <EmptyState
                  title="Data pasar sementara tidak tersedia."
                  action={{ label: 'Coba lagi', onClick: fetchMarket }}
                />
              ) : loadingMarket ? (
                /* ...Task 7's skeleton branch... */
              ) : (
                /* ...existing ihsg branch... */
              )}
```

```tsx
// Task 4's tabbed Market Movers card — wrap in the same check, right before the `<SegmentedControl .../>`:
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
                  onChange={(v) => setMoversTab(v as 'gainer' | 'loser' | 'volume')}
                  options={[
                    { label: 'Top Gainer', value: 'gainer' },
                    { label: 'Top Loser', value: 'loser' },
                    { label: 'Top Volume', value: 'volume' },
                  ]}
                />
                <MarketMoverCard card={activeCard} lastUpdated={moversTimeLabel} loaded={!loadingMarket} />
              </>
            )}
          </motion.div>
        );
```

- [ ] **Step 4: Today's Opportunities (Task 2) and LensRadar (Task 3) already have their own error paths (`picksLoginRequired`/`picksNeedPro` and `radarError` respectively) — no change needed there, just confirm both still compile after this task's edits.**

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — expected: no new errors.
Manual: in devtools, block requests to `/api/live/*` and `/api/market-summary`,
reload `/home`, confirm "Data pasar sementara tidak tersedia." with a
working "Coba lagi" button appears in both LensMarket and Market Movers
instead of a silently empty section.

- [ ] **Step 6: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): add explicit ERROR state with retry for LensMarket and Market Movers fetch failures"
```

---

## Task 9: `/dashboard` — relocate freshness label + add LensRadar rank badge

Moves "Update: HH:MM" from the status-badge row into the Hero next to the
price, and adds a small LensRadar badge (rank/score/reason, from the same
`/api/ai-pick` list as Task 3 — omit if the ticker isn't in the current
list, per spec section C correction).

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `/api/ai-pick` (same shape as Task 3), existing `stock`, `ticker`, `lastUpdate: Date | null`, `marketClosed`, `formatTime` (`app/dashboard/page.tsx:363-366`).

- [ ] **Step 1: Remove the "Update: HH:MM" chip from the status-badge row (`app/dashboard/page.tsx:554-556`)**

```tsx
// before:
          <div className="bg-tv-card border border-tv-border px-3 py-1.5 rounded-full text-tv-muted">
            Update: {formatTime(lastUpdate)} • {marketClosed ? 'No Polling' : '1m refresh'}
          </div>
// after (drop the "Update: HH:MM" text, keep the polling-mode chip since that's
// status, not freshness — freshness moves to the Hero in Step 2):
          <div className="bg-tv-card border border-tv-border px-3 py-1.5 rounded-full text-tv-muted">
            {marketClosed ? 'No Polling' : '1m refresh'}
          </div>
```

- [ ] **Step 2: Add the freshness label into the Hero, right under the ticker+price row (`app/dashboard/page.tsx:608-610`, inside the `<div>` that wraps ticker/price/change)**

```tsx
// before (end of the price/change row, app/dashboard/page.tsx:599-610):
              <div className="flex items-center gap-3 mt-1">
                <span className="font-number text-2xl font-bold text-white tabular-nums">
                  Rp {stock.current_price?.toLocaleString('id-ID') || '-'}
                </span>
                <span className={`font-number text-sm font-bold flex items-center gap-0.5 ${
                  (stock.change_pct || 0) >= 0 ? 'text-tv-green' : 'text-tv-red'
                }`}>
                  {(stock.change_pct || 0) >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {stock.change_pct > 0 ? `+${stock.change_pct}` : stock.change_pct}%
                </span>
              </div>
// after (add a freshness line below it):
              <div className="flex items-center gap-3 mt-1">
                <span className="font-number text-2xl font-bold text-white tabular-nums">
                  Rp {stock.current_price?.toLocaleString('id-ID') || '-'}
                </span>
                <span className={`font-number text-sm font-bold flex items-center gap-0.5 ${
                  (stock.change_pct || 0) >= 0 ? 'text-tv-green' : 'text-tv-red'
                }`}>
                  {(stock.change_pct || 0) >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {stock.change_pct > 0 ? `+${stock.change_pct}` : stock.change_pct}%
                </span>
              </div>
              <p className="text-[11px] text-tv-muted mt-1">Update: {formatTime(lastUpdate)}</p>
```

- [ ] **Step 3: Add radar-badge state + fetch (near the other `useState` calls, e.g. after `chartCandles` at `app/dashboard/page.tsx:52`)**

```tsx
  const [radarRank, setRadarRank] = useState<{ finalScore: number; topReasons?: string[] } | null>(null);
```

- [ ] **Step 4: Fetch it inside the existing `fetchAnalyzerData` success branch (`app/dashboard/page.tsx:123-124`, right after `setData(jsonAlgo)`), scoped to the current ticker**

```tsx
      if (jsonAlgo?.stock) {
        setData(jsonAlgo);
        setLastUpdate(new Date());
        // LensRadar rank badge - best-effort, tidak menghalangi render utama kalau gagal
        // atau ticker ini memang tidak ada di daftar ranking hari ini (lihat spec section C).
        fetch('/api/ai-pick', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            const match = (d?.items || []).find((it: any) => it.symbol.replace('.JK', '') === symbol.replace('.JK', ''));
            setRadarRank(match ? { finalScore: match.finalScore, topReasons: match.topReasons } : null);
          })
          .catch(() => setRadarRank(null));
        if (jsonAlgo._quota) {
```

- [ ] **Step 5: Render the badge between the LensScore block (AI Summary, ends `app/dashboard/page.tsx:740`) and the MA Status Badge (`app/dashboard/page.tsx:744`)**

```tsx
        {/* LensRadar rank badge - muncul HANYA kalau ticker ini ada di /api/ai-pick
            hari ini, tidak ada status EARLY/WATCH/dst yang dipaksakan (spec section C). */}
        {radarRank && (
          <div className="w-full flex items-center gap-3 bg-tv-purple/10 border border-tv-purple/25 rounded-lg px-4 py-3">
            <Radar className="w-4 h-4 text-tv-purple shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-mono text-tv-muted uppercase">LensRadar</span>
              <div className="text-sm text-white">
                Skor <strong className="font-number">{radarRank.finalScore}</strong>
                {radarRank.topReasons?.[0] && <span className="text-tv-muted"> — {radarRank.topReasons[0]}</span>}
              </div>
            </div>
          </div>
        )}

        {/* Main Layout */}
```

- [ ] **Step 6: Add `Radar` to the lucide-react import list at the top of `app/dashboard/page.tsx` (check the existing import block first with `grep -n "from 'lucide-react'" app/dashboard/page.tsx` and add `Radar` to whichever line imports `Activity`/`ArrowUpRight` etc.)**

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit` — expected: no new errors.
Manual: open `/dashboard?symbol=BBCA.JK` (or any ticker present in the
current `/api/ai-pick` ranking), confirm "Update: HH:MM" now sits under
the price in the Hero (not in the status-badge row above it), and a
"LensRadar" badge with score+reason appears between AI Summary and the MA
Status badge. Load a ticker NOT in the ranking, confirm the badge is
simply absent (no false "no signal" state).

- [ ] **Step 8: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): relocate freshness label to Hero, add LensRadar rank badge"
```

---

## Task 10: `/dashboard` — Skeleton loading + ERROR state for stock fetch

`fetchAnalyzerData` (`app/dashboard/page.tsx:105-157`) currently only
`console.error`s on failure (line 152-154) — the user sees a stale or
blank Hero with no explanation. This task adds a real ERROR state and
replaces the Hero's ad-hoc loading text with `Skeleton`.

**Files:**
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Add an error-tracking state (near `loading` state)**

```tsx
  const [fetchError, setFetchError] = useState(false);
```

- [ ] **Step 2: Set/clear it in `fetchAnalyzerData` (`app/dashboard/page.tsx:105-157`)**

```tsx
  const fetchAnalyzerData = async (symbol: string) => {
    setLoading(true);
    setFetchError(false);
    try {
      const resAlgo = await fetch(`/api/stock/${symbol}`, { cache: 'no-store' });
      const jsonAlgo = await resAlgo.json();

      if (resAlgo.status === 401) {
        setShowLoginPrompt(true);
        return;
      }
      if (resAlgo.status === 402 || jsonAlgo.code === 'SUBSCRIPTION_REQUIRED') {
        setAnalisaRemaining(0);
        setUsedSymbolsToday(jsonAlgo.usedSymbols || []);
        setShowPaywall(true);
        return;
      }
      if (!resAlgo.ok || !jsonAlgo?.stock) {
        setFetchError(true);
        return;
      }

      setData(jsonAlgo);
      setLastUpdate(new Date());
      /* ...rest of the existing success branch (radar fetch from Task 9, _quota handling,
         update-ai-context dispatch, trackAccuracy call) stays exactly as-is, just now
         reached only when jsonAlgo.stock is confirmed present... */
    } catch (e) {
      console.error('Failed to fetch data', e);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 3: Render the error state — wrap the Hero card's contents (`app/dashboard/page.tsx:589` onward) with a `fetchError` branch**

```tsx
        {/* Hero */}
        {fetchError ? (
          <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-2">
            <EmptyState
              title="Data pasar sementara tidak tersedia."
              action={{ label: 'Coba lagi', onClick: () => fetchAnalyzerData(ticker) }}
            />
          </div>
        ) : loading && !data ? (
          <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-2 flex items-center gap-4">
            <Skeleton variant="circle" className="w-12 h-12" />
            <div className="space-y-2">
              <Skeleton variant="text" className="w-40 h-6" />
              <Skeleton variant="text" className="w-28" />
            </div>
          </div>
        ) : (
          <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-2 flex flex-wrap items-center justify-between gap-4">
            {/* ...existing Hero JSX from Task 9, unchanged... */}
          </div>
        )}
```

`loading && !data` (rather than just `loading`) keeps the existing content
visible during a background refresh (1-minute polling) instead of
flashing a skeleton over live data every 60 seconds — matches spec item 23
("pertahankan previous data saat refresh jika aman").

- [ ] **Step 4: Import `Skeleton`, `EmptyState` in `app/dashboard/page.tsx` (check existing imports first; this file doesn't yet import from `@/components/ui` per the earlier grep of `components/ui` usage — add a new import line)**

```tsx
import { Skeleton, EmptyState } from '@/components/ui';
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — expected: no new errors.
Manual: block `/api/stock/*` in devtools, load `/dashboard`, confirm
"Data pasar sementara tidak tersedia." with "Coba lagi" replaces the Hero
instead of an empty/stale card. Unblock and click "Coba lagi", confirm it
recovers. Reload normally and confirm the Hero skeleton shows only on
first load, not on the 1-minute auto-refresh.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): add Skeleton for initial Hero load and ERROR state with retry for stock fetch failures"
```

---

## Task 11: Branding subtitle copy pass

Adds the "Name — Description" subtitle pattern (spec item 19) to the 3
pages that already show their brand name but not a description
(spec section B correction — branding itself is not missing, just the
subtitle).

**Files:**
- Modify: `app/breakout-radar/page.tsx`
- Modify: `app/screener/page.tsx`
- Modify: `app/watchlist/page.tsx`

- [ ] **Step 1: `app/breakout-radar/page.tsx` — add a subtitle under the "LensRadar Live" heading (`app/breakout-radar/page.tsx:141-152`)**

```tsx
// before:
              <h1 className="font-heading font-bold text-xl text-tv-text tracking-tight flex items-center gap-2">
                LensRadar Live
                {stale ? <Badge variant="neutral" dot>Data Sesi Terakhir</Badge> : <Badge variant="danger" dot>Live</Badge>}
              </h1>
              <p className="text-xs text-tv-muted flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3" /> {updateLabel ? `${stale ? 'Data sesi terakhir' : 'Data'} per ${updateLabel}` : 'Memuat...'}
              </p>
// after (add the description line above the existing timestamp line):
              <h1 className="font-heading font-bold text-xl text-tv-text tracking-tight flex items-center gap-2">
                LensRadar Live
                {stale ? <Badge variant="neutral" dot>Data Sesi Terakhir</Badge> : <Badge variant="danger" dot>Live</Badge>}
              </h1>
              <p className="text-xs text-tv-muted mt-0.5">Breakout & Opportunity Scanner</p>
              <p className="text-xs text-tv-muted flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3" /> {updateLabel ? `${stale ? 'Data sesi terakhir' : 'Data'} per ${updateLabel}` : 'Memuat...'}
              </p>
```

- [ ] **Step 2: `app/screener/page.tsx` — align the existing `moduleTitle` copy with the spec's exact wording (`app/screener/page.tsx:98`)**

```tsx
// before:
        moduleTitle="LensScanner Multi-Factor"
// after:
        moduleTitle="LensScanner — Filter Saham Multi-Faktor"
```

- [ ] **Step 3: `app/watchlist/page.tsx` — add a subtitle under the "LensWatch" heading (`app/watchlist/page.tsx:282`; read the 5 lines around it first with `grep -n -A3 -B3 "LensWatch" app/watchlist/page.tsx` to confirm the exact surrounding markup before editing, since this file wasn't fully read during planning)**

```tsx
// after the <h2>LensWatch</h2> line, add:
              <p className="text-xs text-tv-muted mt-0.5">Portfolio & Notifikasi</p>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — expected: no new errors.
Manual: visit `/breakout-radar`, `/screener`, `/watchlist`, confirm each
heading now has a one-line Indonesian/English-brand description under it,
consistent with `/dashboard`'s "LensTechnical — Pure Algorithmic Trading"
pattern.

- [ ] **Step 5: Commit**

```bash
git add app/breakout-radar/page.tsx app/screener/page.tsx app/watchlist/page.tsx
git commit -m "feat(nav): add Name — Description subtitle pattern to LensRadar, LensScanner, LensWatch headings"
```

---

## Task 12: Mobile audit (code review, not screenshots)

No Playwright/chromium-cli available in this environment — this is a
Tailwind-breakpoint code review of the 4 files touched most in this build,
per spec section G. Findings get fixed inline in this same task.

**Files:**
- Review + fix as needed: `app/home/page.tsx`, `app/dashboard/page.tsx`, `components/Sidebar.tsx`, `components/Header.tsx`

- [ ] **Step 1: Search each file for classes that commonly cause mobile overflow or undersized touch targets**

Run each of these and read the matches:
```bash
grep -n "overflow-x\|min-w-\[" app/home/page.tsx app/dashboard/page.tsx
grep -n "className=\"[^\"]*\bp-1\b\|className=\"[^\"]*\bp-1\.5\b" app/home/page.tsx app/dashboard/page.tsx components/Header.tsx components/Sidebar.tsx
grep -n "grid-cols-[3-9]\|flex-nowrap" app/home/page.tsx app/dashboard/page.tsx
```

- [ ] **Step 2: For every icon-only `<button>` found with `p-1` or `p-1.5` (below the ~44px touch-target guideline at 375px width with a `w-4 h-4`/`w-5 h-5` icon), bump to `p-2` (yields ~32-36px with a 16-20px icon plus border — acceptable per spec's "sekitar 44px", not a hard requirement) unless it's already `p-2` or larger. Do this per-match; there is no single before/after snippet since matches vary by file — apply the same one-line class change at each site found in Step 1.**

- [ ] **Step 3: For any new grid introduced in this build (Task 2-5's new `/home` sections) confirm each uses `grid-cols-1` at the base breakpoint with `md:`/`xl:` scaling up — Tasks 2, 3, 5 in this plan all use single-column `space-y-2` lists (not grids), so this should already be compliant; verify by reading the rendered JSX, not by re-deriving from memory.**

- [ ] **Step 4: Confirm the new LensRadar (Task 3) and Today's Opportunities (Task 2) row items (`flex items-center justify-between gap-3`) don't force a fixed min-width that overflows at 360px — check the `font-number text-sm font-bold` ticker span and the score span both use `shrink-0`/`min-w-0` correctly (both tasks' code above already includes `min-w-0` on the text container and `shrink-0` on the fixed-width side — confirm this rendered correctly, no fix expected here unless the manual check in Step 5 finds otherwise).**

- [ ] **Step 5: Manual verification**

Resize the browser (or devtools device toolbar) to 360px, 390px, and 412px
widths on `/home` and `/dashboard`. Confirm: no horizontal scrollbar on the
page body, Sidebar opens as a full-width drawer (already implemented,
`components/Sidebar.tsx:224`: `w-72` mobile / `md:w-20` collapsed
desktop), Header's search input and hamburger don't overlap, all new cards
from Tasks 2-10 stack in a single column and their text truncates instead
of overflowing.

- [ ] **Step 6: Commit (only if Step 2 made changes; if the audit found nothing to fix, skip the commit and note that in the task's completion report)**

```bash
git add app/home/page.tsx app/dashboard/page.tsx components/Header.tsx components/Sidebar.tsx
git commit -m "fix(mobile): bump icon-only button touch targets found during BUILD 001 mobile audit"
```

---

## Task 13: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all existing tests pass, plus Task 1's 5 new
`formatFreshnessLabel` tests.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds, all routes compile (in particular `/home`,
`/dashboard`, `/breakout-radar`, `/screener`, `/watchlist`).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new warnings (particularly unused-import warnings from any
icon swaps in Tasks 3, 5, 7, 9).

- [ ] **Step 5: Local dev server smoke pass**

```bash
npm run dev
```

Then, in a second terminal:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/home
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/dashboard
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/breakout-radar
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/screener
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/watchlist
```
Expected: `200` or a `307` redirect to `/login` for auth-gated routes if
run without a session cookie (matches existing behavior, not a regression)
— read the dev server log output for any runtime error stack traces during
these requests, since no browser automation is available to catch
client-side rendering errors visually (spec section G limitation, stated
explicitly rather than silently assumed fine).

- [ ] **Step 6: Report status**

No commit for this task (verification only). Summarize pass/fail for each
of Steps 1-5 back to the user before considering BUILD 001 complete —
if anything fails, fix it in a follow-up commit under the task that
introduced the regression, not a generic "fix build" commit.


