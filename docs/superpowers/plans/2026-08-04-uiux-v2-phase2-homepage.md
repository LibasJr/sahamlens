# UI/UX V2 Total Redesign — Phase 2: Homepage (`/home`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder and rewire `app/home/page.tsx` into the mission doc's Homepage V2 hierarchy — Market Pulse → Hero Opportunity → LensRadar → Market Movers → Insights → Watchlist Snapshot — reusing existing endpoints only, zero new business logic, zero route changes.

**Architecture:** Single-file change (`app/home/page.tsx`). 3 tasks, each producing a working, independently buildable state of the file: (1) Market Pulse rewire + new Hero Opportunity section (both reuse existing endpoints, `/api/market-pulse` and `/api/ai-pick`), (2) layout restructure (LensRadar unhooked from its grid, Jadwal Terdekat merged with Watchlist Snapshot at the bottom, LensScanner teaser moved to the very bottom), (3) new Insights section from already-fetched `dailyPicks` data.

**Tech Stack:** Next.js (app router), React, Tailwind, `components/ui/*` primitives (`Card`, `Badge`, `Skeleton`, `EmptyState`, `SegmentedControl`, `PageContainer`), `framer-motion` (`fadeUp`/`staggerContainer` from `lib/motion`).

**Spec:** `docs/superpowers/specs/2026-08-04-uiux-v2-phase2-homepage-design.md`

## Global Constraints

- Zero business logic / API / route regression — no new endpoint, no formula/scoring change, no route added/removed/renamed.
- No fake/dummy data — every value must come from an endpoint the app already calls somewhere (`/api/ai-pick`, `/api/market-pulse`, `/api/daily-picks` are all pre-existing, already used elsewhere in the codebase).
- Market Pulse's sector/breadth data is intentionally Pro-gated (matches `/api/market-pulse`'s existing 402 behavior and the page's existing Pro-gating pattern for "Today's Opportunities") — this is an approved, deliberate behavior change, not a bug.
- IHSG itself stays visible to all users via the global `TopMarketBar` (Phase 1) even though it's removed from this page's Market Pulse card.
- After every task: `npx tsc --noEmit`, `npm test`, `npm run build` must all pass. `npm run lint` may be unreliable depending on environment (nested worktree path can trigger an unrelated ESLint plugin conflict, per Phase 1) — run it, but don't treat a lint failure as blocking unless it names a rule violation actually caused by this diff.

---

### Task 1: Market Pulse rewire + Hero Opportunity

**Files:**
- Modify: `app/home/page.tsx`

**Interfaces:**
- Produces: `radarStale: boolean` state (new), `fetchRadar` extended to set `picksNeedPro`/`picksLoginRequired` (existing state, `:103-104`) and `radarStale` on 401/402/response. `fetchMarketPulse: () => void` (new `useCallback`), `marketPulse`/`marketPulseNeedPro`/`marketPulseLoginRequired`/`marketPulseError`/`loadingMarketPulse` state (new).
- Consumes: nothing new from other tasks — this task is self-contained and can run first.
- Note for Task 2: after this task, the JSX order (top to bottom) is Header → AI briefing → **Market Pulse** → **Hero Opportunity** → [Jadwal Terdekat + LensRadar grid, untouched by this task] → Market Movers → LensScanner teaser → LensWatch. Task 2 will restructure everything from the grid downward — it does not need anything from this task except the fact that Market Pulse and Hero now sit in this order, unchanged by Task 2.

- [ ] **Step 1: Remove the old `AiPick` interface and its state/fetch**

In `app/home/page.tsx`, delete the interface at lines 28-34:
```tsx
interface AiPick {
  ticker: string;
  price: number;
  changePct: number;
  consensus: string;
  confidence: number;
}
```

Delete the state declaration at line 70:
```tsx
  const [aiPicks, setAiPicks] = useState<AiPick[]>([]);
```

Delete the state declaration at line 101:
```tsx
  const [loadingPicks, setLoadingPicks] = useState(true);
```

Delete the fetch block currently at lines 143-154 (inside the `useEffect` that also calls `fetchMarket()`):
```tsx
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
```

Do NOT delete the `const PICK_UNIVERSE = ...` constant (line 51) yet if anything else references it — grep for `PICK_UNIVERSE` after this step; if this fetch block was its only use, delete the constant too (it's dead code once this fetch is gone).

Do NOT delete `picksNeedPro`/`picksLoginRequired` state (lines 103-104) — they stay, and get re-wired to `/api/ai-pick` in Step 3.

- [ ] **Step 2: Add `radarStale` state**

Near the existing `radarItems`/`loadingRadar`/`radarError` state (around line 85-89), add:
```tsx
  const [radarStale, setRadarStale] = useState(false);
```

- [ ] **Step 3: Extend `fetchRadar` with 401/402 handling and `stale`**

Replace the existing `fetchRadar` (currently lines 185-196):
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
```
with:
```tsx
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
```
Note: `.slice(0, 5)` is intentionally removed here — the full ranked array is kept in state, and Hero (`radarItems[0]`) vs LensRadar section (`radarItems.slice(1, 6)`, wired in Task 2) both slice from the same source array at render time so they never go out of sync or duplicate an item.

- [ ] **Step 4: Add Market Pulse state and `fetchMarketPulse`**

Near the other `useCallback` fetchers (after `fetchMarket`, around line 138), add:
```tsx
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
```
In the `useEffect` that currently calls `fetchMarket()` (around line 140-141), add a call to `fetchMarketPulse()` right after it:
```tsx
  useEffect(() => {
    fetchMarket();
    fetchMarketPulse();
    // ...rest of the effect body unchanged
```

- [ ] **Step 5: Fix `topPick` derivation and the AI briefing effect**

Replace line 224:
```tsx
  const topPick = aiPicks.find((p) => p.consensus === 'STRONG BUY') || aiPicks[0];
```
with:
```tsx
  const topPick = radarItems[0];
```

Read `app/api/ai-briefing/route.ts` to see exactly which fields of the `topPick` object its request-body schema actually reads (the current payload sends `{ ticker, consensus, confidence }`, built from the old `AiPick` shape). `AiPickItem` (the new `topPick` type, from `modules/recommendation/service/ai-pick.service.ts:56-76`) has `symbol` (not `ticker`), no `consensus` field, and `finalScore` (not `confidence`). Update the payload construction at lines 247-255:
```tsx
      body: JSON.stringify({
        topPick: topPick ? { ticker: topPick.ticker, consensus: topPick.consensus, confidence: topPick.confidence } : null,
```
to map the new shape — use `topPick.symbol.replace('.JK', '')` for `ticker`, and for `consensus` use the same derived label used in the Hero UI (Step 7): `topPick.flagged ? topPick.flagReason : 'STRONG BUY'` (this mirrors the fact that every item in this ranked list already cleared the same score threshold `getKategori()` uses for its own BUY label, per `modules/recommendation/service/ai-pick.service.ts:5-8`), and `confidence: topPick.finalScore`. If `app/api/ai-briefing/route.ts`'s schema validation is strict about a `consensus` value ("STRONG BUY"/"BUY"/etc — check the file), match its expected format rather than inventing new wording.

Update the effect's guard condition at line 243 (`if (loadingMarket || loadingPicks || loadingDailyPicks || aiBriefing) return;`) — replace `loadingPicks` with `loadingRadar`.

- [ ] **Step 6: Replace the "Today's Opportunities" JSX with Hero Opportunity**

Replace the entire block currently at lines 320-367 (from the comment `{/* Today's Opportunities ... */}` through the closing `</motion.div>`) with:
```tsx
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
                {hero.topReasons.length > 0 && (
                  <ul className="text-xs text-tv-muted space-y-1">
                    {hero.topReasons.slice(0, 3).map((r, i) => <li key={i}>• {r}</li>)}
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
```

- [ ] **Step 7: Replace the "LensMarket" (IHSG-only) JSX with Market Pulse — and move it BEFORE the Hero block**

The existing "LensMarket" block is currently at lines 369-417 (right after the block Step 6 just replaced). Cut it entirely and replace it with the JSX below — then place this new block IMMEDIATELY BEFORE the Hero Opportunity block from Step 6 (i.e., the final order after this step is: AI briefing hero → **Market Pulse** → **Hero Opportunity** → the untouched Jadwal/LensRadar grid). Both blocks are now adjacent motion.div siblings — moving one above the other is a plain cut-and-paste of the JSX block, nothing inside either block needs to change because of the reorder.

```tsx
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
```

The old IHSG-specific state (`ihsg`, `ihsgFreshness`, `ihsgTimeLabel`) and the `fetchMarket` function itself are NOT touched by this step — `fetchMarket` still populates `topGainers`/`topLosers`/`topVolume`/etc. that Market Movers (untouched, Task 2/3 don't touch it either) still needs, and `ihsg` is still read by the AI briefing payload (line 249, `indices: ihsg ? [{ name: 'IHSG', changePct: ihsg.changePct }] : []` — leave this line exactly as-is).

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all succeed. `grep -n "AiPick\b" app/home/page.tsx` should show zero matches (the interface and all its usages are gone). `grep -n "/api/recommendations" app/home/page.tsx` should show zero matches.

- [ ] **Step 9: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): rewire Market Pulse (sector+breadth, Pro-gated) and Hero Opportunity (reuse /api/ai-pick)"
```

---

### Task 2: Layout restructure — LensRadar standalone, Jadwal Terdekat + Watchlist Snapshot merged, LensScanner teaser moved to bottom

**Files:**
- Modify: `app/home/page.tsx`

**Interfaces:**
- Consumes: `radarItems`, `radarError`, `loadingRadar`, `fetchRadar` (all from Task 1, unchanged shape except `radarItems` is now the full unsliced array per Task 1 Step 3).
- Produces: nothing new consumed by Task 3 except the fact that after this task, the block sequence from Market Movers downward is: Market Movers → *(empty slot — Task 3 fills this with Insights)* → Jadwal Terdekat + Watchlist Snapshot grid → LensScanner teaser → modals.

- [ ] **Step 1: Unhook LensRadar from the 2-column grid, make it a standalone section**

Find the grid block (currently starts with the comment `{/* Jadwal Terdekat & LensRadar sejajar 1 baris ... */}` and the line `<motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">`, and ends at the matching `</motion.div>` — this wraps two `<Card>` blocks, "Jadwal Terdekat" and "LensRadar").

Extract the **LensRadar** `<Card>` (the second of the two, containing `<CardTitle>LensRadar</CardTitle>`) out of this grid entirely. Wrap it in its own `<motion.div variants={fadeUp} initial="hidden" animate="show">` (matching the pattern every other standalone section on this page uses) and leave it in the same general position (right where the grid used to be, immediately after the Market Pulse/Hero pair from Task 1).

Within that extracted LensRadar card, make two changes:
1. The items list currently maps `radarItems.map((it) => ...)` — change to `radarItems.slice(1, 6).map((it) => ...)` (skip index 0, which is now the Hero item from Task 1 — this avoids showing the same stock twice).
2. The empty-state condition currently checks `radarItems.length === 0` — change to `radarItems.length <= 1` (with only 1 item total, there's nothing left for this section once index 0 is reserved for Hero).

Everything else inside the LensRadar card (loading skeleton, error state, item rendering fields, the `border-l-tv-warning`/`border-l-tv-green` flagged styling) stays exactly as it was — this step only changes its wrapper and the two lines above.

- [ ] **Step 2: Extract Jadwal Terdekat from the old grid, defer it — do not delete it yet**

The **Jadwal Terdekat** `<Card>` (the first of the two former grid children) needs to end up merged with Watchlist Snapshot at the bottom of the page (Step 3). Cut its full JSX (from `<Card hoverable>` through its matching `</Card>`, including the `<motion.div variants={fadeUp}>` wrapper it already has) out of its current position. You'll paste it into the new grid built in Step 3 — do this as one continuous edit (cut here, paste there) rather than deleting and rewriting from scratch, so none of its internals (the `calendarEvents` mapping, the empty/loading states) need to be retyped.

After Steps 1-2, the old grid wrapper (`<motion.div ... className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">` and its matching closing tag, plus the now-empty comment above it) should be deleted — nothing is left inside it.

- [ ] **Step 3: Merge Jadwal Terdekat into a new grid with Watchlist Snapshot, at the bottom**

Find the "LensWatch" `<Card>` block (comment `{/* LensWatch - ringkasan singkat ... */}`, wrapped in its own `<motion.div variants={fadeUp} initial="hidden" animate="show">`). Replace its wrapper so both cards sit side-by-side:

```tsx
      <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <motion.div variants={fadeUp}>
          {/* Jadwal Terdekat card cut from Step 2, pasted here verbatim */}
        </motion.div>
        <motion.div variants={fadeUp}>
          {/* LensWatch card's existing <Card>...</Card> content, verbatim - just re-wrapped */}
        </motion.div>
      </motion.div>
```

The `<Card>` internals for both (Jadwal Terdekat's calendar-event list, LensWatch's watchlist preview) are unchanged — only their outer wrapper changes from two separate `<motion.div variants={fadeUp} initial="hidden" animate="show">` blocks into one `staggerContainer` grid with two `fadeUp` children, matching the exact pattern the old Jadwal+LensRadar grid used (`staggerContainer`/`fadeUp` are already imported at the top of the file, no new import needed).

- [ ] **Step 4: Move LensScanner teaser to the very bottom**

The "LensScanner" teaser `<Card>` (comment `{/* LensScanner - teaser ... */}`) currently sits between Market Movers and LensWatch. Cut its full block (including its `<motion.div variants={fadeUp} initial="hidden" animate="show">` wrapper) and paste it immediately after the new Jadwal Terdekat + Watchlist Snapshot grid from Step 3, and before the `<PromoUpgradeModal .../>` line that closes out the page. Its internal content (icon, title, subtitle, CTA link to `/screener`) does not change.

After this step, the bottom-to-top tail of the page should read: Market Movers → *(Task 3 will insert Insights here)* → Jadwal Terdekat + Watchlist Snapshot grid → LensScanner teaser → `<PromoUpgradeModal>`/`<PaywallModal>`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all succeed.

Manual: run `npm run dev`, open `/home` (logged in), confirm visually top-to-bottom: AI briefing → Market Pulse → Hero → LensRadar (standalone, showing different stocks than Hero) → Market Movers → Jadwal Terdekat + Watchlist Snapshot side by side → LensScanner teaser. Confirm the LensRadar section's first row is NOT the same stock as the Hero card above it.

- [ ] **Step 6: Commit**

```bash
git add app/home/page.tsx
git commit -m "refactor(home): unhook LensRadar from grid, merge Jadwal Terdekat with Watchlist Snapshot at bottom, move LensScanner teaser to end"
```

---

### Task 3: Insights section (Golden/Dead Cross)

**Files:**
- Modify: `app/home/page.tsx`

**Interfaces:**
- Consumes: `dailyPicks` state (existing, from `/api/daily-picks` fetch which Task 1/2 did not touch) — this task only extends its TypeScript type and adds a new render block; the fetch itself is unchanged.
- Produces: nothing consumed by other tasks — this is the last task in the plan.

- [ ] **Step 1: Extend `DailyPickCounts`**

Replace the interface currently at lines 44-49:
```tsx
interface DailyPickCounts {
  attractive: { count: number };
  breakout: { count: number };
  undervalue: { count: number };
  foreignAccumulation: { count: number };
}
```
with:
```tsx
interface DailyPickCounts {
  attractive: { count: number };
  breakout: { count: number };
  undervalue: { count: number };
  foreignAccumulation: { count: number };
  goldenCross: { count: number; stale: boolean };
  deadCross: { count: number; stale: boolean };
}
```
This matches the actual response shape already returned by `app/api/daily-picks/route.ts:74-89` (`category()` helper output includes `count`; `stale` is spread in from the outer object at the same level as `count` — read that file's `goldenCross`/`deadCross` response construction directly to confirm before writing this type, in case the exact nesting has shifted since this plan was written).

- [ ] **Step 2: Insert the Insights card**

Insert this new block right after the Market Movers section (the self-invoking `{(() => { ... })()}` block that renders the movers tabs) and before whatever now immediately follows it (per Task 2, that should be the Jadwal Terdekat + Watchlist Snapshot grid):

```tsx
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
            <Skeleton className="h-16 w-full" />
          ) : !dailyPicks ? (
            <EmptyState title="Data insight sementara tidak tersedia." />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-tv-bg/50 border border-tv-border rounded-md p-3">
                <div className="text-[10px] text-tv-muted uppercase tracking-wide">Golden Cross</div>
                <div className="font-number text-2xl font-bold text-tv-green mt-1">{dailyPicks.goldenCross.count}</div>
                {dailyPicks.goldenCross.stale && <div className="text-[10px] text-tv-warning mt-1">Data sesi terakhir</div>}
              </div>
              <div className="bg-tv-bg/50 border border-tv-border rounded-md p-3">
                <div className="text-[10px] text-tv-muted uppercase tracking-wide">Dead Cross</div>
                <div className="font-number text-2xl font-bold text-tv-red mt-1">{dailyPicks.deadCross.count}</div>
                {dailyPicks.deadCross.stale && <div className="text-[10px] text-tv-warning mt-1">Data sesi terakhir</div>}
              </div>
            </div>
          )}
        </Card>
      </motion.div>
```

`loadingDailyPicks` and `dailyPicks` state already exist (lines 78, 102) and are already populated by the existing `/api/daily-picks` fetch (lines 159-163, untouched) — no new fetch, no new loading state.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all succeed.

Manual: open `/home`, confirm the Insights card renders between Market Movers and the Jadwal Terdekat/Watchlist grid, showing Golden Cross / Dead Cross counts. Cross-check the numbers against `/breakout-radar`'s own Golden Cross / Dead Cross tabs (if visible) for the same session — they should match (same underlying cache).

- [ ] **Step 4: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): add Market Insights section (Golden/Dead Cross) from already-fetched dailyPicks data"
```

---

## Self-Review Notes

- **Spec coverage:** All 6 spec decisions map to a task: Market Pulse Pro-gating + Hero data source → Task 1; LensRadar standalone + Jadwal/Watchlist merge + Scanner move → Task 2; Insights → Task 3. Final section order (Market Pulse → Hero → LensRadar → Market Movers → Insights → Watchlist/Jadwal → Scanner) is achieved cumulatively across all 3 tasks.
- **Type consistency:** `radarItems` type (`{symbol, price, changePct, finalScore, topReasons?, flagged, flagReason}`, declared once at the top of the file, untouched by any task) is read identically by Hero (Task 1, `radarItems[0]`) and LensRadar (Task 2, `radarItems.slice(1,6)`) — same shape, no divergence. `DailyPickCounts.goldenCross`/`deadCross` (Task 3) is the only interface Task 3 touches; no other task reads `dailyPicks`.
- **Task dependency:** Task 2 depends on Task 1 only for the *order* Market Pulse/Hero end up in (informational, not a code dependency — Task 2 doesn't reference any Task 1-introduced state). Task 3 has no code dependency on Tasks 1-2, only a positional one (inserts after Market Movers, which neither prior task moves). Recommended order: 1, 2, 3 — reflects the plan's own narrative dependency even where not strictly required by compilation.
