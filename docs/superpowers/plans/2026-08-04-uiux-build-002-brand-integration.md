# UI/UX BUILD 002 — Brand Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend LensScore to a 5-category breakdown (Momentum/Risk added
via already-computed analyzer data), upgrade LensRadar/LensFlow to show
more of what's already available (inline top reason, 5-tier status
derived from existing streak data), and apply a documented "Signal Card"
left-border className preset to both — all presentation-layer, no new
API routes, no change to `total_score`/`kategori`/BUY-SELL logic.

**Architecture:** Same as BUILD 001 — pure presentation-layer changes on
top of the existing Next.js 14 App Router + Nucleus design system. The
one new pure-logic addition (Momentum/Risk score derivation) lives in a
single small, unit-tested utility file consuming data the backend already
computes and already transmits.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind
(Nucleus tokens), Vitest.

## Global Constraints

- No new API routes, no changes to `calculateScore()`/`total_score`/
  `kategori` or any BUY/SELL/HOLD decision logic.
- No status taxonomy invented beyond what's derived from real existing
  fields (`summary.streak`, analyzer `decision`/`confidence`/`raw`).
- Reuse existing `components/ui/Card` — no new card component, no new
  props on it. "Signal Card" is a documented className convention only.
- Indonesian UI copy throughout, English-style brand names unchanged
  (LensScore, LensRadar, LensFlow).
- Spec doc: `docs/superpowers/specs/2026-08-04-uiux-build-002-brand-integration-design.md`.

---

## Task 1: Momentum/Risk score utility (TDD)

**Files:**
- Create: `lib/utils/lens-score-breakdown.ts`
- Test: `lib/utils/__tests__/lens-score-breakdown.test.ts`

**Interfaces:**
- Produces: `momentumScore(analyzers: AnalyzerEntry[]): number | null`, `riskScore(analyzers: AnalyzerEntry[], currentPrice: number): number | null` — both consumed by Task 2 (`app/dashboard/page.tsx`).
- `AnalyzerEntry` (local type, matches the real shape already used elsewhere in `app/dashboard/page.tsx` via `analyzers.find(...)`): `{ label?: string; decision?: string; confidence?: number; raw?: { atr?: number | null } }`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/utils/__tests__/lens-score-breakdown.test.ts
import { describe, it, expect } from 'vitest';
import { momentumScore, riskScore } from '../lens-score-breakdown';

const momentumEntry = (decision: string, confidence: number) => [
  { label: 'Momentum 1D/5D', decision, confidence },
];

describe('momentumScore', () => {
  it('returns confidence directly when bullish', () => {
    expect(momentumScore(momentumEntry('BULLISH', 80))).toBe(80);
  });

  it('inverts confidence when bearish', () => {
    expect(momentumScore(momentumEntry('BEARISH', 80))).toBe(20);
  });

  it('returns 50 when neutral', () => {
    expect(momentumScore(momentumEntry('NEUTRAL', 50))).toBe(50);
  });

  it('returns null when the momentum analyzer entry is missing', () => {
    expect(momentumScore([{ label: 'RSI (14)', decision: 'BULLISH', confidence: 70 }])).toBeNull();
  });
});

describe('riskScore', () => {
  it('gives a high score for low volatility (~1.5% ATR)', () => {
    // atr = 15, currentPrice = 1000 -> volatilityPct = 1.5
    const analyzers = [{ label: 'Volatility (ATR 14)', decision: 'NEUTRAL', confidence: 72, raw: { atr: 15 } }];
    expect(riskScore(analyzers, 1000)).toBe(Math.round(100 - 1.5 * 15));
  });

  it('gives a lower score for high volatility (~3% ATR)', () => {
    // atr = 30, currentPrice = 1000 -> volatilityPct = 3
    const analyzers = [{ label: 'Volatility (ATR 14)', decision: 'NEUTRAL', confidence: 85, raw: { atr: 30 } }];
    expect(riskScore(analyzers, 1000)).toBe(Math.round(100 - 3 * 15));
  });

  it('clamps to 0 for extreme volatility', () => {
    const analyzers = [{ label: 'Volatility (ATR 14)', decision: 'NEUTRAL', confidence: 90, raw: { atr: 200 } }];
    expect(riskScore(analyzers, 1000)).toBe(0);
  });

  it('returns null when the volatility analyzer entry or its raw.atr is missing', () => {
    expect(riskScore([{ label: 'RSI (14)', decision: 'BULLISH', confidence: 70 }], 1000)).toBeNull();
    expect(riskScore([{ label: 'Volatility (ATR 14)', decision: 'NEUTRAL', confidence: 50, raw: { atr: null } }], 1000)).toBeNull();
  });

  it('returns null when currentPrice is not a positive number', () => {
    const analyzers = [{ label: 'Volatility (ATR 14)', decision: 'NEUTRAL', confidence: 72, raw: { atr: 15 } }];
    expect(riskScore(analyzers, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/utils/__tests__/lens-score-breakdown.test.ts`
Expected: FAIL with "Cannot find module '../lens-score-breakdown'"

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/utils/lens-score-breakdown.ts
interface AnalyzerEntry {
  label?: string;
  decision?: string;
  confidence?: number;
  raw?: { atr?: number | null };
}

export function momentumScore(analyzers: AnalyzerEntry[]): number | null {
  const entry = analyzers.find((a) => a.label?.includes('Momentum'));
  if (!entry || typeof entry.confidence !== 'number') return null;
  if (entry.decision === 'BULLISH') return entry.confidence;
  if (entry.decision === 'BEARISH') return 100 - entry.confidence;
  return 50;
}

export function riskScore(analyzers: AnalyzerEntry[], currentPrice: number): number | null {
  if (typeof currentPrice !== 'number' || currentPrice <= 0) return null;
  const entry = analyzers.find((a) => a.label?.includes('Volatility'));
  const atr = entry?.raw?.atr;
  if (typeof atr !== 'number') return null;
  const volatilityPct = (atr / currentPrice) * 100;
  return Math.max(0, Math.min(100, Math.round(100 - volatilityPct * 15)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/utils/__tests__/lens-score-breakdown.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/utils/lens-score-breakdown.ts lib/utils/__tests__/lens-score-breakdown.test.ts
git commit -m "feat(uiux): add momentumScore/riskScore utilities for LensScore 5-category breakdown"
```

---

## Task 2: `/dashboard` — wire 5-category LensScore breakdown

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `momentumScore`, `riskScore` from Task 1; existing `data.analyzers` (already fetched, already used by the MA Status badge at `app/dashboard/page.tsx:756-771`); existing `data.stock.current_price` / `data.price`.

- [ ] **Step 1: Import the new utility at the top of `app/dashboard/page.tsx`**

```tsx
import { momentumScore, riskScore } from '@/lib/utils/lens-score-breakdown';
```

- [ ] **Step 2: Compute the two new scores once, near where `analyzers`/`price` are already destructured for the MA Status badge (`app/dashboard/page.tsx:756-758`, inside the `data?.scoring && (() => { ... })()` block) — add two more `const` lines alongside `const detail = data.scoring.detail;`**

```tsx
// existing:
          {data?.scoring && (() => {
            const detail = data.scoring.detail;
            const price = data.price;
            const maResult = analyzers.find((a: any) => a.label?.includes('MA Trend'));
// add right after `const price = data.price;`:
            const momentum = momentumScore(analyzers);
            const risk = riskScore(analyzers, data.stock?.current_price ?? price);
```

This reuses the SAME `analyzers` variable already in scope for the MA
Status computation later in the same IIFE — no new fetch, no new prop
drilling.

- [ ] **Step 3: Add two rows to the Score Breakdown block (`app/dashboard/page.tsx:725-752`), and rename "Arus Dana" to "Money Flow" per spec item 19's English-style brand consistency**

```tsx
// before (app/dashboard/page.tsx:725-752):
              <div className="flex-1 space-y-3">
                <div className="text-[10px] font-mono text-tv-muted uppercase tracking-wider mb-2">BREAKDOWN SKOR</div>
                {/* Technical */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tv-muted font-mono w-28">Technical (0-40)</span>
                  <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-tv-green/80 to-tv-green rounded-full transition-all" style={{width: `${(data.scoring.technical_score / 40) * 100}%`}}></div>
                  </div>
                  <span className="text-sm font-bold text-white font-number w-8 text-right">{data.scoring.technical_score}</span>
                </div>
                {/* Fundamental */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tv-muted font-mono w-28">Fundamental (0-30)</span>
                  <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-400/80 to-blue-400 rounded-full transition-all" style={{width: `${(data.scoring.fundamental_score / 30) * 100}%`}}></div>
                  </div>
                  <span className="text-sm font-bold text-white font-number w-8 text-right">{data.scoring.fundamental_score}</span>
                </div>
                {/* Flow */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tv-muted font-mono w-28">Arus Dana (0-30)</span>
                  <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-tv-yellow/80 to-tv-yellow rounded-full transition-all" style={{width: `${(data.scoring.flow_score / 30) * 100}%`}}></div>
                  </div>
                  <span className="text-sm font-bold text-white font-number w-8 text-right">{data.scoring.flow_score}</span>
                </div>
              </div>

// after:
              <div className="flex-1 space-y-3">
                <div className="text-[10px] font-mono text-tv-muted uppercase tracking-wider mb-2">BREAKDOWN SKOR</div>
                {/* Technical */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tv-muted font-mono w-28">Technical (0-40)</span>
                  <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-tv-green/80 to-tv-green rounded-full transition-all" style={{width: `${(data.scoring.technical_score / 40) * 100}%`}}></div>
                  </div>
                  <span className="text-sm font-bold text-white font-number w-8 text-right">{data.scoring.technical_score}</span>
                </div>
                {/* Momentum - baru (BUILD 002), turunan dari analyzer Momentum 1D/5D yang
                    sudah dihitung tapi belum ditampilkan di sini. Tidak ikut total_score. */}
                {momentum !== null && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-tv-muted font-mono w-28">Momentum (0-100)</span>
                    <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-400/80 to-purple-400 rounded-full transition-all" style={{width: `${momentum}%`}}></div>
                    </div>
                    <span className="text-sm font-bold text-white font-number w-8 text-right">{momentum}</span>
                  </div>
                )}
                {/* Fundamental */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tv-muted font-mono w-28">Fundamental (0-30)</span>
                  <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-400/80 to-blue-400 rounded-full transition-all" style={{width: `${(data.scoring.fundamental_score / 30) * 100}%`}}></div>
                  </div>
                  <span className="text-sm font-bold text-white font-number w-8 text-right">{data.scoring.fundamental_score}</span>
                </div>
                {/* Flow */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tv-muted font-mono w-28">Money Flow (0-30)</span>
                  <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-tv-yellow/80 to-tv-yellow rounded-full transition-all" style={{width: `${(data.scoring.flow_score / 30) * 100}%`}}></div>
                  </div>
                  <span className="text-sm font-bold text-white font-number w-8 text-right">{data.scoring.flow_score}</span>
                </div>
                {/* Risk - baru (BUILD 002), turunan dari analyzer Volatility (ATR 14).
                    Makin tinggi = makin aman (konsisten "tinggi = baik" seperti kategori
                    lain) - BUKAN raw volatility percentage. Tidak ikut total_score. */}
                {risk !== null && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-tv-muted font-mono w-28">Risk (0-100)</span>
                    <div className="flex-1 bg-tv-hover rounded-full h-3 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-tv-red/80 to-tv-red rounded-full transition-all" style={{width: `${risk}%`}}></div>
                    </div>
                    <span className="text-sm font-bold text-white font-number w-8 text-right">{risk}</span>
                  </div>
                )}
              </div>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — expected: no new errors.
Manual: open `/dashboard?symbol=BBCA.JK`, confirm the AI Summary panel now
shows 5 breakdown rows (Technical, Momentum, Fundamental, Money Flow,
Risk) instead of 3, and `total_score`/consensus badge values are
unchanged from before this task (same ticker, compare against a pre-task
screenshot or just confirm the LensScore circle number matches
`data.scoring.total_score` as it always has).

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): extend LensScore breakdown to 5 categories (add Momentum, Risk)"
```

---

## Task 3: `/breakout-radar` — inline top reason + Signal Card border

Shows the single top reason inline (spec item 9 — card/row should show
1-3 reasons without requiring a click), and applies the "Signal Card"
left-border convention (spec section E) to the row.

**Files:**
- Modify: `app/breakout-radar/page.tsx`

- [ ] **Step 1: Add the inline reason under the ticker (`app/breakout-radar/page.tsx:217-227`)**

```tsx
// before:
                          <td className="py-3 px-4 font-bold font-number whitespace-nowrap">
                            <Link
                              href={`/technical/${it.symbol}`}
                              className="text-tv-text hover:text-tv-blue transition-colors"
                            >
                              {displayTicker(it.symbol)}
                            </Link>
                            {it.flagged && (
                              <span className="ml-2 text-tv-red text-xs font-normal">! {it.flagReason}</span>
                            )}
                          </td>
// after:
                          <td className="py-3 px-4 font-bold font-number whitespace-nowrap">
                            <Link
                              href={`/technical/${it.symbol}`}
                              className="text-tv-text hover:text-tv-blue transition-colors"
                            >
                              {displayTicker(it.symbol)}
                            </Link>
                            {it.flagged && (
                              <span className="ml-2 text-tv-red text-xs font-normal">! {it.flagReason}</span>
                            )}
                            {it.topReasons?.[0] && (
                              <div className="text-[10px] font-normal text-tv-muted truncate max-w-[220px]">{it.topReasons[0]}</div>
                            )}
                          </td>
```

- [ ] **Step 2: Apply the Signal Card left-border convention to the row itself (`app/breakout-radar/page.tsx:215`)**

```tsx
// before:
                        <tr className="hover:bg-tv-hover/30">
// after (Signal Card convention, spec section E - green border for a
// non-flagged/healthy signal, amber for a flagged/contradictory one):
                        <tr className={`hover:bg-tv-hover/30 border-l-4 ${it.flagged ? 'border-l-tv-warning' : 'border-l-tv-green'}`}>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — expected: no new errors.
Manual: open `/breakout-radar`, confirm each row shows its top reason
under the ticker without needing to click the expand chevron, and a
colored left border (green normally, amber when flagged).

- [ ] **Step 4: Commit**

```bash
git add app/breakout-radar/page.tsx
git commit -m "feat(breakout-radar): show top reason inline, apply Signal Card left-border convention"
```

---

## Task 4: `/home` — LensRadar card price/change + Signal Card border

**Files:**
- Modify: `app/home/page.tsx`

**Interfaces:**
- Consumes: `/api/ai-pick`'s items, which already include `price`/`changePct` per `AiPickItem` (`app/breakout-radar/page.tsx:15-29`) — the `/home` fetch (Task 3 of BUILD 001) only kept `symbol`/`finalScore`/`topReasons`/`flagged`/`flagReason` in its local state type; this task widens it.

- [ ] **Step 1: Widen the `radarItems` state type (`app/home/page.tsx:83-85`)**

```tsx
// before:
  const [radarItems, setRadarItems] = useState<
    { symbol: string; finalScore: number; topReasons?: string[]; flagged: boolean; flagReason: string | null }[]
  >([]);
// after:
  const [radarItems, setRadarItems] = useState<
    { symbol: string; price: number; changePct: number; finalScore: number; topReasons?: string[]; flagged: boolean; flagReason: string | null }[]
  >([]);
```

`fetchRadar`'s `setRadarItems((d.items || []).slice(0, 5))` (BUILD 001,
`app/home/page.tsx`) already stores the full API item objects — no change
needed there, `price`/`changePct` were already present on the stored
objects, just not in the TypeScript type or the render.

- [ ] **Step 2: Render price/change and apply the Signal Card border (`app/home/page.tsx:490-503`)**

```tsx
// before:
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
// after:
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
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — expected: no new errors.
Manual: reload `/home`, confirm each LensRadar row now shows price and
% change alongside the score, with the same colored left-border
convention as `/breakout-radar`.

- [ ] **Step 4: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): show price/change on LensRadar cards, apply Signal Card left-border convention"
```

---

## Task 5: LensFlow — 5-tier status + heading copy + Signal Card border

**Files:**
- Modify: `components/BandarFlowPro.tsx`

- [ ] **Step 1: Derive the 5-tier label + reuse the existing color mapping, right after `const { summary } = data;` (`components/BandarFlowPro.tsx:60`)**

```tsx
// before:
  const { summary } = data;

  let insightColor = 'bg-gray-800/40 border-gray-600 text-gray-300';
  let insightBadge = 'bg-gray-500 text-white';
  let insightTitle = 'NETRAL';
  let insightMessage = 'Belum ada tren arus dana yang konsisten dalam 3 hari terakhir.';

  if (summary.status === 'AKUMULASI') {
    insightColor = 'bg-tv-green/10 border-tv-green/50 text-tv-green';
    insightBadge = 'bg-tv-green text-white';
    insightTitle = 'TEKANAN BELI KONSISTEN';
    insightMessage = summary.streak >= 3
      ? `Akumulasi ${summary.streak} hari berturut-turut - volume di hari naik lebih besar dari hari turun.`
      : 'Tekanan beli mendominasi 3 hari terakhir.';
  } else if (summary.status === 'DISTRIBUSI') {
    insightColor = 'bg-tv-red/10 border-tv-red/50 text-tv-red';
    insightBadge = 'bg-tv-red text-white';
    insightTitle = 'TEKANAN JUAL KONSISTEN';
    insightMessage = 'Volume di hari turun lebih besar dari hari naik 3 hari terakhir - waspada.';
  }

// after:
  const { summary } = data;

  // 5-tier LensFlow status (spec BUILD 002 item 10) - turunan dari summary.status
  // (3 nilai) + summary.streak (sudah dihitung, sudah dipakai badge "N HARI" di bawah),
  // BUKAN status baru dari backend. STRONG cuma penanda visual (badge terisi penuh vs
  // outline), bukan ambang beda formula.
  const isStrong = summary.streak >= 3;
  const flowTier =
    summary.status === 'AKUMULASI' ? (isStrong ? 'STRONG ACCUMULATION' : 'ACCUMULATION') :
    summary.status === 'DISTRIBUSI' ? (isStrong ? 'STRONG DISTRIBUTION' : 'DISTRIBUTION') :
    'NEUTRAL';

  let insightColor = 'bg-gray-800/40 border-gray-600 text-gray-300';
  let insightBadge = 'bg-gray-500 text-white';
  let insightTitle = 'NETRAL';
  let insightMessage = 'Belum ada tren arus dana yang konsisten dalam 3 hari terakhir.';

  if (summary.status === 'AKUMULASI') {
    insightColor = 'bg-tv-green/10 border-tv-green/50 text-tv-green';
    insightBadge = 'bg-tv-green text-white';
    insightTitle = 'TEKANAN BELI KONSISTEN';
    insightMessage = isStrong
      ? `Akumulasi ${summary.streak} hari berturut-turut - volume di hari naik lebih besar dari hari turun.`
      : 'Tekanan beli mendominasi 3 hari terakhir.';
  } else if (summary.status === 'DISTRIBUSI') {
    insightColor = 'bg-tv-red/10 border-tv-red/50 text-tv-red';
    insightBadge = 'bg-tv-red text-white';
    insightTitle = 'TEKANAN JUAL KONSISTEN';
    insightMessage = 'Volume di hari turun lebih besar dari hari naik 3 hari terakhir - waspada.';
  }
```

- [ ] **Step 2: Render the 5-tier badge instead of the 3-value one (`components/BandarFlowPro.tsx:96-112`)**

```tsx
// before:
        <div className="flex items-center gap-3">
          {summary.status === 'AKUMULASI' && (
            <div className="px-4 py-1.5 rounded-full bg-tv-green/20 border border-tv-green text-tv-green font-bold text-sm font-mono animate-pulse">
              AKUMULASI
            </div>
          )}
          {summary.status === 'DISTRIBUSI' && (
            <div className="px-4 py-1.5 rounded-full bg-tv-red/20 border border-tv-red text-tv-red font-bold text-sm font-mono">
              DISTRIBUSI
            </div>
          )}
          {summary.status === 'NETRAL' && (
            <div className="px-4 py-1.5 rounded-full bg-gray-500/20 border border-gray-500 text-gray-400 font-bold text-sm font-mono">
              NETRAL
            </div>
          )}
        </div>

// after:
        <div className="flex items-center gap-3">
          {summary.status === 'AKUMULASI' && (
            <div className={`px-4 py-1.5 rounded-full border font-bold text-sm font-mono ${isStrong ? 'bg-tv-green/30 border-tv-green text-tv-green animate-pulse' : 'bg-tv-green/10 border-tv-green/60 text-tv-green'}`}>
              {flowTier}
            </div>
          )}
          {summary.status === 'DISTRIBUSI' && (
            <div className={`px-4 py-1.5 rounded-full border font-bold text-sm font-mono ${isStrong ? 'bg-tv-red/30 border-tv-red text-tv-red' : 'bg-tv-red/10 border-tv-red/60 text-tv-red'}`}>
              {flowTier}
            </div>
          )}
          {summary.status === 'NETRAL' && (
            <div className="px-4 py-1.5 rounded-full bg-gray-500/20 border border-gray-500 text-gray-400 font-bold text-sm font-mono">
              {flowTier}
            </div>
          )}
        </div>
```

- [ ] **Step 3: Align the heading line to the spec's copy pattern (`components/BandarFlowPro.tsx:91-92`) — keep the existing disclaimer subtitle verbatim (load-bearing honesty copy from a prior data-integrity audit), only change the `<h3>` text**

```tsx
// before:
            <h3 className="font-heading font-bold text-white text-lg">LensFlow — Bandar & Arus Dana</h3>
            <p className="text-xs text-tv-muted font-mono">Estimasi arus dana dari volume transaksi - bukan data broker resmi</p>
// after:
            <h3 className="font-heading font-bold text-white text-lg">LensFlow — Analisis Money Flow</h3>
            <p className="text-xs text-tv-muted font-mono">Estimasi arus dana dari volume transaksi - bukan data broker resmi</p>
```

- [ ] **Step 4: Apply the Signal Card left-border convention to the panel's outer container (`components/BandarFlowPro.tsx:82`)**

```tsx
// before:
  return (
    <div className="bg-tv-bg border border-tv-border rounded-xl p-5 shadow-1 flex flex-col gap-6">
// after:
  const borderAccent = summary.status === 'AKUMULASI' ? 'border-l-tv-green' : summary.status === 'DISTRIBUSI' ? 'border-l-tv-red' : 'border-l-tv-border';
  return (
    <div className={`bg-tv-bg border border-tv-border rounded-xl p-5 shadow-1 flex flex-col gap-6 border-l-4 ${borderAccent}`}>
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — expected: no new errors.
Manual: open `/dashboard?symbol=BBCA.JK` (or any ticker with an active
accumulation/distribution streak), confirm the LensFlow panel shows one
of the 5 tier labels (not just AKUMULASI/DISTRIBUSI/NETRAL), the STRONG
variants look visually more emphatic (filled vs outline badge), and the
heading now reads "LensFlow — Analisis Money Flow" with the disclaimer
subtitle unchanged.

- [ ] **Step 6: Commit**

```bash
git add components/BandarFlowPro.tsx
git commit -m "feat(flow): upgrade LensFlow to 5-tier status (STRONG variants from existing streak data), align heading copy"
```

---

## Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all existing tests pass, plus Task 1's 9 new
`momentumScore`/`riskScore` tests.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds, all routes compile (in particular `/dashboard`,
`/home`, `/breakout-radar`).

- [ ] **Step 4: Local dev server smoke pass**

```bash
npm run dev
```
Then, in a second terminal, hit `/dashboard?symbol=BBCA.JK`, `/home`,
`/breakout-radar` with curl for status codes, and read the dev server log
for runtime errors (no browser automation available, same limitation as
BUILD 001 — state this explicitly rather than claiming visual
verification).

- [ ] **Step 5: Report status**

No commit for this task (verification only). Summarize pass/fail for
each of Steps 1-4 before considering BUILD 002 complete.
