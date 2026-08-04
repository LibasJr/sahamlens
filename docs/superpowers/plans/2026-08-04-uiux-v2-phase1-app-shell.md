# UI/UX V2 Total Redesign — Phase 1: Design System + App Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 1 of the SahamLens UI/UX V2 total redesign — a global Top Market Bar, a regrouped Sidebar (Discover/Analyze/Intelligence/Monitor), and design-token/primitive cleanup — with zero regression to routes, API contracts, or business logic.

**Architecture:** Additive app-shell change (new `TopMarketBar` component wired into `AppShell.tsx`, only inside the existing Sidebar branch), a mechanical `NAV_GROUPS` re-array in `Sidebar.tsx`, a small `lib/utils/market.ts` extraction, a new `PageContainer` primitive that 18 existing pages adopt (pure DRY, zero visual change), and 4 spots in `components/Dashboard.tsx` migrated from raw divs to the existing `<Card>` primitive.

**Tech Stack:** Next.js (app router), React, Tailwind, `lucide-react` icons, `clsx`/`tailwind-merge` (`lib/utils/cn.ts`), existing `components/ui/*` primitives.

**Spec:** `docs/superpowers/specs/2026-08-04-uiux-v2-phase1-app-shell-design.md`

## Global Constraints

- Zero business logic / API / route regression — Phase 1 touches presentation only, no route added/removed/renamed (spec §Scope, mission doc "ZERO BUSINESS LOGIC REGRESSION").
- No fake/dummy data — every value TopMarketBar shows must come from a real endpoint already used elsewhere in the app (`/api/live/^JKSE`), never a placeholder number (mission doc "DILARANG ... fake data").
- Brand color rule: Blue/Cyan = AI/info, Green = bullish, Red = bearish/risk (mission doc "VISUAL RULES") — applies to the `.ai-response` palette swap in Task 1.
- Landing page `/` (`components/Dashboard.tsx` root render) keeps its own header, no `Sidebar`/`TopMarketBar` — decision #1 in the spec, do not touch `AppShell.tsx`'s `isLandingPage` branch (`AppShell.tsx:15-21`).
- After every task: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` must all pass before commit (repo convention, see prior `docs/superpowers/plans/*` files).

---

### Task 1: Design Tokens Cleanup

**Files:**
- Modify: `app/globals.css:6` (background var), `app/globals.css:67-186` (`.ai-response` block)
- Modify: `components/Header.tsx:84`
- Modify: `app/dashboard/page.tsx:711,722,734,737`

**Interfaces:**
- Consumes: nothing (pure CSS/className edits, no new exports)
- Produces: nothing consumed by later tasks — independent of all other tasks in this plan

- [ ] **Step 1: Fix `--background` var to match `tv-bg`**

In `app/globals.css:6`, change:
```css
  --background: #0A0E27;
```
to:
```css
  --background: #0F141D;
```

- [ ] **Step 2: Fix `font-mono` misuse on labels (5 locations)**

In `components/Header.tsx:84`, change:
```tsx
        <span className="text-[10px] font-mono text-tv-blue uppercase tracking-wider font-bold">{moduleBank}</span>
```
to:
```tsx
        <span className="text-[10px] font-sans text-tv-blue uppercase tracking-wider font-bold">{moduleBank}</span>
```

In `app/dashboard/page.tsx:711`, change:
```tsx
                <div className="text-[10px] font-mono text-tv-muted uppercase tracking-wider text-center flex flex-col gap-1 items-center justify-center">
```
to:
```tsx
                <div className="text-[10px] font-sans font-semibold text-tv-muted uppercase tracking-wider text-center flex flex-col gap-1 items-center justify-center">
```

In `app/dashboard/page.tsx:722`, change:
```tsx
                <div className={`text-sm font-bold font-mono px-3 py-1 rounded-full border ${
```
to:
```tsx
                <div className={`text-sm font-bold font-sans px-3 py-1 rounded-full border ${
```

In `app/dashboard/page.tsx:734`, change:
```tsx
                <div className="text-[10px] font-mono text-tv-muted uppercase tracking-wider mb-2">BREAKDOWN SKOR</div>
```
to:
```tsx
                <div className="text-[10px] font-sans font-semibold text-tv-muted uppercase tracking-wider mb-2">BREAKDOWN SKOR</div>
```

In `app/dashboard/page.tsx:737`, change:
```tsx
                  <span className="text-xs text-tv-muted font-mono w-28">Technical (0-40)</span>
```
to:
```tsx
                  <span className="text-xs text-tv-muted font-sans w-28">Technical (0-40)</span>
```

Note: this pattern (`text-xs text-tv-muted font-mono w-28`) repeats for the other 4 breakdown rows (Momentum, Fundamental, Money Flow, Risk) immediately below line 737 in the same file — apply the same `font-mono` → `font-sans` swap to all of them (search `font-mono w-28` in this file, replace every match).

- [ ] **Step 3: Swap `.ai-response` teal palette to blue**

In `app/globals.css`, replace the entire `.ai-response` block (currently lines 67-186, starting at `/* ====== AI Chat Response Typography ====== */` and ending before the final blank line after `.ai-response a:hover`) with:

```css
/* ====== AI Chat Response Typography ====== */
.ai-response {
  color: #dbeafe;
  font-size: 13px;
  line-height: 1.75;
  max-width: 100%;
  word-wrap: break-word;
}

.ai-response p {
  margin-bottom: 12px;
}

.ai-response p:last-child {
  margin-bottom: 0;
}

.ai-response h1, .ai-response h2, .ai-response h3 {
  color: #ffffff;
  font-weight: 700;
  margin-top: 16px;
  margin-bottom: 8px;
}

.ai-response h1 { font-size: 18px; }
.ai-response h2 { font-size: 16px; border-bottom: 1px solid #2563EB; padding-bottom: 4px; }
.ai-response h3 { font-size: 14px; color: #93c5fd; }

.ai-response strong, .ai-response b {
  color: #ffffff;
  font-weight: 700;
}

.ai-response em, .ai-response i {
  color: #bfdbfe;
  font-style: italic;
}

.ai-response ul, .ai-response ol {
  margin: 8px 0 12px 0;
  padding-left: 20px;
}

.ai-response li {
  margin-bottom: 6px;
  line-height: 1.6;
}

.ai-response li::marker {
  color: #3A86FF;
}

.ai-response code {
  background: rgba(37, 99, 235, 0.25);
  color: #93c5fd;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Fira Code', 'Cascadia Code', monospace;
}

.ai-response pre {
  background: #0c1424;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 12px;
  margin: 10px 0;
  overflow-x: auto;
}

.ai-response pre code {
  background: transparent;
  padding: 0;
}

.ai-response blockquote {
  border-left: 3px solid #3A86FF;
  padding: 6px 12px;
  margin: 10px 0;
  background: rgba(58, 134, 255, 0.08);
  border-radius: 0 6px 6px 0;
  color: #bfdbfe;
}

.ai-response hr {
  border: none;
  border-top: 1px solid #1e293b;
  margin: 14px 0;
}

.ai-response table {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0;
  font-size: 12px;
}

.ai-response th {
  background: rgba(37, 99, 235, 0.2);
  color: #93c5fd;
  text-align: left;
  padding: 6px 10px;
  border: 1px solid #1e293b;
  font-weight: 600;
}

.ai-response td {
  padding: 5px 10px;
  border: 1px solid #1e293b;
}

.ai-response a {
  color: #60a5fa;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.ai-response a:hover {
  color: #93c5fd;
}
```

- [ ] **Step 4: Verify**

Run: `grep -rn "font-mono" app/dashboard/page.tsx components/Header.tsx`
Expected: no remaining matches on the label lines touched above (module-bank badge, LensScore label, kategori badge, "BREAKDOWN SKOR", all 5 breakdown-row sub-labels). Any other `font-mono` in `app/dashboard/page.tsx` not touched here must be genuinely tabular/code data — do not change those.

Run: `grep -n "#0A0E27\|#ccfbf1\|#5eead4\|#14b8a6\|#0f766e\|#99f6e4\|#2dd4bf" app/globals.css`
Expected: no matches.

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css components/Header.tsx app/dashboard/page.tsx
git commit -m "fix(design-system): unify background token, enforce font-sans on labels, swap AI chat palette teal to blue"
```

---

### Task 2: Shared `PageContainer` primitive

**Files:**
- Create: `components/ui/PageContainer.tsx`
- Modify: `components/ui/index.ts:13` (add export)
- Modify: 17 files, 18 wrapper divs total (list in Step 3)

**Interfaces:**
- Produces: `PageContainer` component, `import { PageContainer } from '@/components/ui'`, props `{ className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>`. Not consumed by any other task in this plan (Task 5's `TopMarketBar` does not use it — the bar is full-width, not page content).
- Consumes: `cn` from `lib/utils/cn.ts` (existing).

**Out of scope (do not touch in this task):** `components/Dashboard.tsx:56` — the landing page's own `max-w-[1600px] mx-auto` wrapper is structurally different (combined with `overflow-hidden px-4 sm:px-6 lg:px-8` on the sticky header, not a page-content wrapper) and the landing page is explicitly out of scope for Phase 1 app-shell changes (see Global Constraints).

- [ ] **Step 1: Create `PageContainer`**

Create `components/ui/PageContainer.tsx`:

```tsx
import React from 'react';
import { cn } from '../../lib/utils/cn';

export function PageContainer({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('max-w-[1600px] mx-auto w-full', className)} {...props}>
      {children}
    </div>
  );
}

export default PageContainer;
```

- [ ] **Step 2: Export from barrel**

In `components/ui/index.ts`, add after line 3 (`export { Card, ... } from './Card';`):
```ts
export { PageContainer } from './PageContainer';
```

- [ ] **Step 3: Migrate all 18 wrapper divs**

For each row below: import `PageContainer` from `@/components/ui` in the file (add to existing `@/components/ui` import if one already exists in that file, otherwise add a new import line), replace the opening tag with `<PageContainer className="...">` (className = original className with `max-w-[1600px] mx-auto w-full` removed, everything else kept verbatim and in the same order), and replace that same element's matching closing tag with `</PageContainer>`.

| # | File:Line | Original opening tag | New opening tag |
|---|---|---|---|
| 1 | `app/calendar/page.tsx:166` | `<div className="p-6 max-w-[1600px] mx-auto w-full">` | `<PageContainer className="p-6">` |
| 2 | `app/breakout-radar/page.tsx:160` | `<div className="p-6 max-w-[1600px] mx-auto w-full">` | `<PageContainer className="p-6">` |
| 3 | `app/watchlist/page.tsx:317` | `<div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">` | `<PageContainer className="p-6 space-y-6 grid grid-cols-1 lg:grid-cols-3 gap-6">` |
| 4 | `app/backtest/page.tsx:172` | `<div className="px-6 pt-6 max-w-[1600px] mx-auto w-full">` | `<PageContainer className="px-6 pt-6">` |
| 5 | `app/backtest/page.tsx:180` | `<div className="p-6 max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">` | `<PageContainer className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">` |
| 6 | `app/technical/[symbol]/page.tsx:199` | `<div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">` | `<PageContainer className="p-6 space-y-6">` |
| 7 | `app/market-pulse/page.tsx:229` | `<div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">` | `<PageContainer className="p-6 space-y-6">` |
| 8 | `app/screener/page.tsx:102` | `<div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">` | `<PageContainer className="p-6 space-y-6">` |
| 9 | `app/macro/page.tsx:29` | `<div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">` | `<PageContainer className="p-6 space-y-6">` |
| 10 | `app/risk-calculator/page.tsx:93` | `<div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">` | `<PageContainer className="p-6 space-y-6">` |
| 11 | `components/TickerAnalysisShell.tsx:57` | `<div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">` | `<PageContainer className="p-6 space-y-6">` |
| 12 | `app/home/page.tsx:264` | `<div className="p-4 md:p-6 max-w-[1600px] mx-auto w-full space-y-5 min-h-full flex flex-col">` | `<PageContainer className="p-4 md:p-6 space-y-5 min-h-full flex flex-col">` |
| 13 | `app/recommendations/page.tsx:232` | `<div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">` | `<PageContainer className="p-6 space-y-6">` |
| 14 | `app/fundamental/page.tsx:258` | `<div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">` | `<PageContainer className="p-6 space-y-6">` |
| 15 | `app/portfolio/page.tsx:395` | `<main className="max-w-[1600px] mx-auto mt-4 px-4 lg:px-6">` | `<PageContainer className="mt-4 px-4 lg:px-6">` (note: this one is a `<main>` tag, not `<div>` — it's nested inside `AppShell.tsx`'s own `<main>` at `AppShell.tsx:32`, which is an invalid nested-landmark; converting to `PageContainer`'s `<div>` fixes that as a side effect, also update the matching closing tag from `</main>` to `</PageContainer>`) |
| 16 | `app/news/page.tsx:66` | `<div className="p-6 max-w-[1600px] mx-auto w-full">` | `<PageContainer className="p-6">` |
| 17 | `app/dashboard/page.tsx:571` | `<div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">` | `<PageContainer className="p-6 space-y-6">` |
| 18 | `app/compare/page.tsx:138` | `<div className="p-6 max-w-[1600px] mx-auto w-full space-y-6">` | `<PageContainer className="p-6 space-y-6">` |

- [ ] **Step 4: Verify**

Run: `grep -rn "max-w-\[1600px\] mx-auto w-full" app/ components/`
Expected: zero matches (every instance was either migrated or, for `components/Dashboard.tsx:56`, doesn't match this exact string — confirm it still shows only that one line, unmigrated, as intended).

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all succeed. `npm run build` must generate all 18 touched routes without error — this is the most reliable signal that every closing tag was matched correctly.

- [ ] **Step 5: Commit**

```bash
git add components/ui/PageContainer.tsx components/ui/index.ts app/calendar/page.tsx app/breakout-radar/page.tsx app/watchlist/page.tsx app/backtest/page.tsx "app/technical/[symbol]/page.tsx" app/market-pulse/page.tsx app/screener/page.tsx app/macro/page.tsx app/risk-calculator/page.tsx components/TickerAnalysisShell.tsx app/home/page.tsx app/recommendations/page.tsx app/fundamental/page.tsx app/portfolio/page.tsx app/news/page.tsx app/dashboard/page.tsx app/compare/page.tsx
git commit -m "feat(design-system): add PageContainer primitive, migrate 18 pages off duplicated max-w wrapper"
```

---

### Task 3: Card primitive migration in `components/Dashboard.tsx`

**Files:**
- Modify: `components/Dashboard.tsx:10` (import), `:400`, `:427`, `:501`, `:604`

**Interfaces:**
- Consumes: `Card` from `components/ui/Card.tsx` (existing, `variant`/`hoverable`/`padding` props documented in spec §Audit).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add `Card` to the existing `components/ui` import**

In `components/Dashboard.tsx:10`, change:
```tsx
import { SegmentedControl } from '@/components/ui';
```
to:
```tsx
import { Card, SegmentedControl } from '@/components/ui';
```

- [ ] **Step 2: Migrate the marketing hero card (`:400`)**

Change the opening tag at `Dashboard.tsx:400`:
```tsx
        <div className="mb-6 flex items-center justify-between gap-6 rounded-lg border border-tv-border bg-tv-card/50 px-5 py-4 sm:px-8 sm:py-6">
```
to:
```tsx
        <Card padding="none" className="mb-6 flex items-center justify-between gap-6 bg-tv-card/50 px-5 py-4 sm:px-8 sm:py-6">
```
Find this element's matching closing `</div>` (the block ends after the `<img ... />` that follows on the next lines) and change it to `</Card>`.

- [ ] **Step 3: Migrate the featured chart card (`:427`)**

Change the opening tag at `Dashboard.tsx:427`:
```tsx
        <div className="relative overflow-hidden rounded-xl border border-tv-border bg-tv-card shadow-2">
```
to:
```tsx
        <Card padding="none" className="relative overflow-hidden rounded-xl shadow-2">
```
This is the largest block in the file (chart + LensRadar list + TP/CL ticker, ends around line 601-602 per the audit). Find its matching closing `</div>` and change it to `</Card>`. `rounded-xl`/`shadow-2` in the `className` override `Card`'s default `rounded-lg`/`shadow-1` via `tailwind-merge` — visual output must stay identical to before.

- [ ] **Step 4: Migrate the "Berita Terkini" card (`:501`)**

Change the opening tag at `Dashboard.tsx:501`:
```tsx
              <div className="mt-4 rounded-lg border border-tv-border bg-tv-card p-4">
```
to:
```tsx
              <Card padding="md" className="mt-4">
```
(`padding="md"` = `p-4`, an exact match for the original `p-4` — no className override needed for padding.) Find the matching closing `</div>` and change it to `</Card>`.

- [ ] **Step 5: Migrate the bottom meta bar (`:604`)**

Change the opening tag at `Dashboard.tsx:604`:
```tsx
        <div className="mt-8 rounded-lg border border-tv-border bg-tv-card px-5 py-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-tv-muted">
```
to:
```tsx
        <Card padding="none" className="mt-8 flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-[11px] text-tv-muted">
```
Find the matching closing `</div>` (this block ends right before the closing `</div>` of the outer page wrapper) and change it to `</Card>`.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed, `/` route builds without JSX mismatch errors (a mismatched open/close tag from steps 2-5 will surface here as a syntax error).

Manual: run `npm run dev`, open `http://localhost:3000/`, visually compare the 4 touched cards (marketing hero banner, featured chart card, "Berita Terkini" panel, bottom disclaimer bar) against a screenshot or memory of the current production look — border/radius/shadow/spacing must be pixel-identical to before this task.

- [ ] **Step 7: Commit**

```bash
git add components/Dashboard.tsx
git commit -m "refactor(home): migrate 4 raw card divs in Dashboard.tsx to Card primitive"
```

---

### Task 4: Sidebar regroup — Discover / Analyze / Intelligence / Monitor

**Files:**
- Modify: `components/Sidebar.tsx:54-93` (`NAV_GROUPS`)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks (Task 5 does not read `NAV_GROUPS`).

- [ ] **Step 1: Replace `NAV_GROUPS`**

In `components/Sidebar.tsx`, replace lines 54-93 (the entire `const NAV_GROUPS: NavGroup[] = [...]` block) with:

```tsx
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'discover',
    label: 'Discover',
    items: [
      { id: 'home', name: 'Beranda', subtitle: 'LensAI & Ringkasan Akun', path: '/home', icon: LayoutDashboard },
      { id: 'market-pulse', name: 'LensMarket', subtitle: 'Index, Sector & Breadth', path: '/market-pulse', icon: Activity, live: true },
      { id: 'breakout-radar', name: 'LensRadar', subtitle: 'Breakout & Opportunity Scanner', path: '/breakout-radar', icon: Radar, live: true },
      { id: 'screener', name: 'LensScanner', subtitle: 'Filter Saham Multi-Faktor', path: '/screener', icon: Filter },
    ],
  },
  {
    id: 'analyze',
    label: 'Analyze',
    items: [
      { id: 'dashboard', name: 'LensTechnical', subtitle: '10 Pure Math Filters', path: '/dashboard', icon: LineChart },
      { id: 'fundamental', name: 'LensFundamental', subtitle: 'Value & Health Metrics', path: '/fundamental', icon: Building2 },
      { id: 'compare', name: 'Compare Tool', subtitle: 'Side-by-Side Analysis', path: '/compare', icon: GitCompare },
      { id: 'risk-calculator', name: 'Risk Calculator', subtitle: 'Position Size & Risk/Reward', path: '/risk-calculator', icon: ShieldAlert },
      { id: 'backtest', name: 'Backtest', subtitle: 'Simulasi Strategi dari Data Historis', path: '/backtest', icon: History },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    items: [
      { id: 'council', name: 'LensAI', subtitle: 'Stock Analysis LensAI', path: '/technical/BBCA.JK', icon: Users },
    ],
  },
  {
    id: 'monitor',
    label: 'Monitor',
    items: [
      { id: 'watchlist', name: 'LensWatch', subtitle: 'Portfolio & Notifikasi', path: '/watchlist', icon: Bell },
      { id: 'portfolio', name: 'Akun Demo', subtitle: 'Paper Trading & P/L', path: '/portfolio', icon: Wallet },
      { id: 'calendar', name: 'Corporate Calendar', subtitle: 'Dividen, RUPS, & Corp Action', path: '/calendar', icon: CalendarDays },
      { id: 'news', name: 'Berita', subtitle: 'Berita & Sentimen Pasar', path: '/news', icon: Newspaper },
    ],
  },
];
```

Every `id`/`name`/`subtitle`/`path`/`icon`/`live` value is copied verbatim from the existing array — only group membership and the 4 group `id`/`label` pairs changed. `council`'s `path` still uses the hardcoded `/technical/BBCA.JK` fallback exactly as before (the component overrides this at render time using `councilTicker` state, per `Sidebar.tsx:115-119` — not touched by this task).

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed (no icon import removed/added, so no unused-import lint errors expected).

Manual: run `npm run dev`, open any authenticated route (e.g. `/home`), open the Sidebar — confirm 4 groups render in order Discover → Analyze → Intelligence → Monitor, confirm all 11 links still navigate to their original paths, confirm the collapse-to-icon-rail toggle (desktop `md:w-20` mode) still shows all icons grouped correctly, confirm mobile off-canvas drawer still opens/closes via hamburger and edge-swipe.

- [ ] **Step 3: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat(nav): regroup Sidebar into Discover/Analyze/Intelligence/Monitor per UI/UX V2 mission doc"
```

---

### Task 5: Top Market Bar

**Files:**
- Create: `lib/utils/market.ts`
- Modify: `components/Dashboard.tsx` (remove local `isMarketOpen`, import from `lib/utils/market`)
- Create: `components/TopMarketBar.tsx`
- Modify: `components/AppShell.tsx`
- Modify: `components/Sidebar.tsx` (add `open-profile-modal` event listener)

**Interfaces:**
- Consumes: `CommandPalette` (`components/CommandPalette.tsx`, existing, default export, no required props — used with no `onSelect` so it falls back to `router.push('/technical/${symbol}.JK')` per `CommandPalette.tsx:102-110`), `isMarketOpen` (produced in Step 1 of this task).
- Produces: `isMarketOpen(d: Date): boolean` from `lib/utils/market.ts`, `TopMarketBar` default export (no props) from `components/TopMarketBar.tsx`, `open-profile-modal` window event (no detail payload) that `Sidebar.tsx` now listens for.

- [ ] **Step 1: Extract `isMarketOpen` to `lib/utils/market.ts`**

Create `lib/utils/market.ts`:
```ts
export function isMarketOpen(d: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const map: any = {};
  parts.forEach(p => { map[p.type] = p.value; });
  const weekday = map.weekday;
  const minutes = parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10);
  const isWeekday = weekday !== 'Sat' && weekday !== 'Sun';
  const isFriday = weekday === 'Fri';
  const session1 = minutes >= 9 * 60 && minutes <= 11 * 60 + 30;
  const session2 = isFriday ? (minutes >= 14 * 60 && minutes <= 15 * 60 + 49) : (minutes >= 13 * 60 + 30 && minutes <= 15 * 60 + 49);
  return isWeekday && (session1 || session2);
}
```

This is a byte-for-byte copy of the function body currently at `components/Dashboard.tsx:14-25`.

- [ ] **Step 2: Point `Dashboard.tsx` at the extracted function**

In `components/Dashboard.tsx`, delete the local function definition at lines 14-25 (from `function isMarketOpen(d: Date): boolean {` through its closing `}`).

Add to the top imports (after the existing `import { SegmentedControl } from '@/components/ui';` / now `import { Card, SegmentedControl } from '@/components/ui';` from Task 3):
```tsx
import { isMarketOpen } from '@/lib/utils/market';
```

- [ ] **Step 3: Verify the extraction**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed, `/` route (which calls `isMarketOpen(now)` at the existing call site `Dashboard.tsx:323`, unchanged) still builds.

- [ ] **Step 4: Create `TopMarketBar`**

Create `components/TopMarketBar.tsx`:
```tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, User as UserIcon, Sparkles } from 'lucide-react';
import CommandPalette from '@/components/CommandPalette';
import { isMarketOpen } from '@/lib/utils/market';

export default function TopMarketBar() {
  const [ihsg, setIhsg] = useState<{ price: number; change: number } | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch('/api/live/^JKSE')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.price) setIhsg({ price: data.price, change: data.changePercent });
      })
      .catch(() => {});
  }, []);

  const marketOpen = now ? isMarketOpen(now) : false;
  const jakartaTime = now
    ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(now) + ' WIB'
    : '--:--';

  return (
    <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-tv-border bg-tv-surface/90 px-4 py-2.5 backdrop-blur-md">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] font-sans font-semibold text-tv-muted uppercase tracking-wide">IHSG</span>
        {ihsg ? (
          <span className={`font-number text-[13px] font-bold ${ihsg.change >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
            {ihsg.price.toLocaleString('id-ID')} {ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}%
          </span>
        ) : (
          <span className="text-[13px] text-tv-muted">--</span>
        )}
      </div>

      <span className={`hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium shrink-0 ${marketOpen ? 'text-tv-green' : 'text-tv-muted'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${marketOpen ? 'bg-tv-green animate-pulse' : 'bg-tv-muted'}`} />
        {marketOpen ? 'Bursa Buka' : 'Bursa Tutup'}
      </span>

      <span className="hidden md:inline text-[11px] text-tv-muted shrink-0">Update {jakartaTime}</span>

      <div className="flex-1 min-w-0 max-w-[360px]">
        <CommandPalette />
      </div>

      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('open-ai-chat'))}
          className="hidden sm:flex items-center gap-1.5 rounded-full bg-tv-blue/10 hover:bg-tv-blue/20 text-tv-blue px-3 py-1.5 text-[11px] font-semibold transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" /> Ask LensAI
        </button>
        <Link
          href="/watchlist"
          title="Notifikasi & Alert"
          className="p-2 rounded-md text-tv-muted hover:text-tv-text hover:bg-tv-hover transition-colors"
        >
          <Bell className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('open-profile-modal'))}
          title="Profil"
          className="p-2 rounded-md text-tv-muted hover:text-tv-text hover:bg-tv-hover transition-colors"
        >
          <UserIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

Notes on real-data sourcing (no fake data): IHSG price/change comes from `/api/live/^JKSE`, the exact endpoint `components/Dashboard.tsx:171-179` already uses for the same purpose. Market-open status reuses the same `isMarketOpen` logic already trusted elsewhere. "Ask LensAI" dispatches the same `open-ai-chat` event `AIChat.tsx:39` already listens for (see `AIChat.tsx:27-33` — handles a plain `Event` with no `.detail` fine, `e.detail?.prompt` is optional-chained). The bell links to `/watchlist`, the page that hosts the real LensAlert section — not a fake notification dropdown. The search box is the existing `CommandPalette` component reused as-is (no `onSelect` prop passed, so it falls back to its default navigate-to-`/technical/{symbol}.JK` behavior) — this does **not** duplicate `Header.tsx`'s per-page `SymbolAutocomplete` search, because they serve different purposes: `CommandPalette` navigates away to a different page, while `Header.tsx`'s search changes the ticker being analyzed in place on the current page (e.g. `/dashboard`) without navigating. Both can coexist on the same page with no redundant control.

- [ ] **Step 5: Wire `TopMarketBar` into `AppShell`**

In `components/AppShell.tsx`, add the import:
```tsx
import TopMarketBar from '@/components/TopMarketBar';
```

Change the shell-branch return (`AppShell.tsx:29-37`) from:
```tsx
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {children}
      </main>
      <AIChat />
    </div>
  );
```
to:
```tsx
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <TopMarketBar />
        {children}
      </main>
      <AIChat />
    </div>
  );
```

The `isLandingPage` branch (`AppShell.tsx:15-21`) and `isBareAuthPage` branch (`AppShell.tsx:25-26`) are untouched — `TopMarketBar` only renders inside the Sidebar-shell branch, per spec decision #1.

- [ ] **Step 6: Make Sidebar's profile modal openable from `TopMarketBar`**

In `components/Sidebar.tsx`, add a new effect after the existing auth-check effect (after the closing `}, []);` at line 137):
```tsx
  useEffect(() => {
    const handleOpenProfile = () => setShowProfileModal(true);
    window.addEventListener('open-profile-modal', handleOpenProfile);
    return () => window.removeEventListener('open-profile-modal', handleOpenProfile);
  }, []);
```
This follows the same window-event pattern already used for `toggle-sidebar`/`close-sidebar` elsewhere in this file — `setShowProfileModal` is already declared at `Sidebar.tsx:120`, this just adds a second way to trigger it (the existing footer button at `Sidebar.tsx:328-330` keeps working unchanged).

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all succeed.

Manual: run `npm run dev`.
- Open `/` (landing) — confirm no `TopMarketBar` and no `Sidebar` render (unchanged from before this task).
- Open `/home` — confirm `TopMarketBar` renders once at the top, shows a real IHSG price/change (compare against `/market-pulse` or `/` for the same number), shows "Bursa Buka"/"Bursa Tutup" matching current Jakarta time, "Update HH:MM WIB" ticks.
- Click the search box in `TopMarketBar` (or press Ctrl+K) — `CommandPalette` opens, type a ticker, select it, confirm it navigates to `/technical/{symbol}.JK`.
- Click "Ask LensAI" in `TopMarketBar` — confirm the existing `AIChat` floating panel opens.
- Click the bell icon — confirm it navigates to `/watchlist`.
- Click the profile icon — confirm `UserProfileModal` opens (same modal as clicking the footer profile row in `Sidebar`).
- Open `/dashboard` — confirm both `TopMarketBar`'s `CommandPalette` AND `Header.tsx`'s local ticker search are present and both work independently without visual collision (stacked: `TopMarketBar` above, `Header.tsx` below as the page's own sub-header).
- Resize to 390px width — confirm `TopMarketBar` collapses gracefully (IHSG stays visible, "Bursa Buka" label and "Update" timestamp hide per the `hidden sm:`/`hidden md:` classes, search/Ask LensAI/bell/profile stay usable).

- [ ] **Step 8: Commit**

```bash
git add lib/utils/market.ts components/Dashboard.tsx components/TopMarketBar.tsx components/AppShell.tsx components/Sidebar.tsx
git commit -m "feat(app-shell): add global TopMarketBar (IHSG, market status, search, Ask LensAI shortcut, notifications, profile)"
```

---

## Self-Review Notes

- **Spec coverage:** All 5 spec decisions (§Keputusan produk 1-7 in the design spec) map to a task: TopMarketBar app-shell-only → Task 5; Sidebar regroup → Task 4; background token → Task 1; font-mono enforcement → Task 1; `.ai-response` palette → Task 1; Card migration → Task 3; PageContainer → Task 2.
- **Type consistency:** `PageContainer` props (`Task 2 Step 1`) match its usage in every Task 2 Step 3 row (`className` only, no other props passed). `TopMarketBar` is a zero-prop component, matches its single call site in `AppShell.tsx` (Task 5 Step 5). `isMarketOpen(d: Date): boolean` signature is identical between its original site (`Dashboard.tsx`), its new home (`lib/utils/market.ts`, Task 5 Step 1), and its new consumer (`TopMarketBar.tsx`, Task 5 Step 4).
- **Task independence:** Tasks 1-4 have no interdependency and can run in any order or in parallel. Task 5 depends only on Task 3 having already changed the `components/ui` import line on `Dashboard.tsx:10` (Task 5 Step 2 references the post-Task-3 import line) — Task 5 must run after Task 3. Recommended order: 1, 2, 3, 4, 5.
