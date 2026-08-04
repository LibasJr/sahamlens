# UI/UX BUILD 001 — Foundation Design

Status: approved by user 2026-08-04, ready for implementation plan.

**Correction pass (2026-08-04, during writing-plans research):** deeper file
reads surfaced facts that change three sections below (A, B, C, F marked
inline as `[CORRECTED]`). Recorded here instead of silently rewriting so the
gap between initial brainstorm and actual code is visible.

## Context

Source: full 25-point UI/UX audit spec provided by user ("Modern Financial
Intelligence" direction, journey DISCOVER→ANALYZE→UNDERSTAND→MONITOR),
decomposed into 3 builds by the user's own roadmap. This doc covers **BUILD
001 — Foundation only**. BUILD 002 (Brand Integration) and BUILD 003
(Polish) are separate future specs, not in scope here.

Guardrails from the source spec (apply to all sections below):
- No full redesign, no framework/library swap, no API/business-logic/financial
  formula changes, no existing feature removal, no route changes, no heavy
  animation, no dummy data, no single feature made dominant over others.
- Existing Nucleus design system (`components/ui/*`, `tailwind.config.js`
  tokens) from the 2026-07-31 redesign is the base — reuse its primitives
  (`Card`, `Badge`, `Skeleton`, `EmptyState`, `SegmentedControl`), don't
  rebuild them.

## Scope decisions (resolved via AskUserQuestion during brainstorming)

1. **"Homepage" in the spec = `/home`** (authed personal dashboard), not the
   public `/` landing page. `/` is untouched by this build.
2. **Navigation stays as the existing left Sidebar** (`components/Sidebar.tsx`,
   13 items, grouped, stable since the 2026-07-31 redesign). The spec's
   "simple navbar" request is satisfied only via branded page headings
   (section B), not a Sidebar restructure.
3. **"Stock Detail" in the spec = `/dashboard`** (LensTechnical — Pure
   Algorithmic Trading page), not `/technical/[symbol]` (LensAI Council).
   This matches prior BUILD 004 work that already ordered this page
   Hero→AI Consensus→AI Summary→Chart.

## A. `/home` hierarchy rework

File: `app/home/page.tsx`.

Current order: Header → AI Insight hero → [LensMarket + Jadwal Terdekat
column | "Sinyal Teknikal Bullish" card] → Gainer/Loser/Volume 3-card grid.

Gaps found: `aiPicks` (LensAI recommendations, already fetched from
`/api/recommendations`) is fetched but never rendered as a list — only used
to derive `topPick` for the AI briefing sentence. There is no LensRadar
section (breakout/early-signal status) on this page at all.

New order:
1. AI Insight hero (unchanged)
2. **Today's Opportunities** — new section rendering `aiPicks` (ticker,
   LensScore/confidence, consensus badge) that is already fetched but
   currently discarded after deriving `topPick`.
3. **LensRadar** `[CORRECTED]` — new section, reuse `/api/ai-pick` (this is
   what `app/breakout-radar/page.tsx` "LensRadar Live" actually calls, NOT
   `/api/breakout-radar` — that route exists but is unused by any page,
   confirmed by grep). Data shape is a ranked composite list (`symbol`,
   `finalScore`, `topReasons`, `flagged`/`flagReason`), not a status enum —
   this codebase has no EARLY/WATCH/BREAKOUT/ACCUMULATION/DISTRIBUTION
   classification anywhere. Show top 3-5 ranked items with score + top
   reason, replacing the generic "Sinyal Teknikal Bullish" (MA20>MA50)
   card. Do not invent a status taxonomy the backend doesn't compute
   (violates "no dummy data").
4. **Market Movers** — Gainer/Loser/Volume/Technical collapsed into one card
   with tabs using the existing `SegmentedControl` component, replacing the
   current 3-4 separate cards. Shortens page length per spec principle
   "reduce long sections with tabs/grouping."
5. **LensScanner** — small teaser/CTA card linking to `/screener`, not a
   full embedded table.
6. **LensWatch** — shown only if the user has a non-empty watchlist;
   `EmptyState` otherwise, or omitted entirely for logged-out users.

Jadwal Terdekat (calendar) demoted to secondary visual weight (smaller
card, not equal-weight with LensRadar/Today's Opportunities) — applies
principle "not every card has equal visual weight."

## B. Navigation — branded page headings `[CORRECTED]`

No changes to `components/Sidebar.tsx`. All three pages already show the
brand name prominently in their own custom header markup (not the shared
`Header` component's `moduleTitle` prop — that pattern is `/dashboard`-only):
`/breakout-radar` renders "LensRadar Live" as an `<h1>`, `/screener` already
passes `moduleTitle="LensScanner Multi-Factor"`, `/watchlist` renders
"LensWatch" as an `<h2>`. Branding itself is not missing.

Remaining gap: none of the three follow the spec's "Name — Description"
subtitle pattern (item 19) the way `/dashboard` does
("LensTechnical — Pure Algorithmic Trading"). Task is a small copy addition
next to each existing heading, not new branding:
- `/breakout-radar` → subtitle "Breakout & Opportunity Scanner"
- `/screener` → adjust to "LensScanner — Filter Saham Multi-Faktor"
- `/watchlist` → subtitle "Portfolio & Notifikasi"

## C. Stock Detail (`/dashboard`) hierarchy

File: `app/dashboard/page.tsx`.

Current order: Header → status badge row (market state / last-update time /
refresh button, positioned above Hero) → Hero (ticker+company+price+change+
AI consensus) → AI Summary (LensScore circle + Technical/Fundamental/Flow
breakdown bars) → chart → `BandarFlowPro` (LensFlow — already correctly
avoids claiming real foreign-broker data, no change needed there) → backtest
and other sections.

Changes:
- Move the "Update: HH:MM" freshness text from the status-badge row into
  the Hero, next to the price (spec wants freshness near the data it
  describes, not in a separate row above).
- **Add LensRadar rank badge** `[CORRECTED]` between the LensScore block
  (AI Summary) and LensFlow (`BandarFlowPro`) — small badge showing this
  ticker's rank/score/top reason from `/api/ai-pick`'s current list (same
  source as section A) if the ticker appears in it; omit entirely if not
  present, rather than inventing a "no signal" status the backend doesn't
  compute (see correction in section A — no status enum exists).
- **Chart/LensScore order confirmed unchanged** — resolved via
  AskUserQuestion during writing-plans research. Current order is
  Hero→LensScore(AI Summary)→Chart→LensFlow, which was an explicit BUILD
  004 decision from the prior redesign session, not an accident. The
  source spec's Chart-before-LensScore ordering is NOT applied here to
  avoid overriding a deliberate prior product decision with a ~130-line
  JSX block move for a cosmetic-only reorder.
- **Skip**: LensTechnical indicator grouping (TREND/MOMENTUM/VOLATILITY/
  VOLUME/LEVELS, spec item 11). Not applicable — this page's content is "10
  Pure Math Filters" (named trading methods/strategies), not a flat raw
  indicator readout panel. No grouping work needed here.

## D. Loading states

Scope: `app/home/page.tsx`, `app/dashboard/page.tsx` only (other pages'
"Memuat..." text stays out of scope for BUILD 001).

Replace text/spinner loading states with the existing `Skeleton` component
(`components/ui/Skeleton.tsx`, shimmer already implemented) shaped like the
final layout: price line, card block, chart block, list rows. No new
component needed — just apply it where `"Memuat..."` text or a bare
`Loader2`/`RefreshCw` spin currently stands in for whole-section loading.

## E. Error state

Scope: same two files. Currently most fetches use
`.catch(() => {})`/`.catch(() => null)` — failures are silent, sections
just render empty with no explanation.

Add an explicit ERROR state per data section using the existing
`EmptyState` component (it already supports an action button): message
`"Data pasar sementara tidak tersedia."`, CTA `"Coba lagi"` wired to
re-run that section's fetch. Applies to: LensMarket/IHSG, Market Movers,
Today's Opportunities (AI Picks), LensRadar (section A, new) on `/home`;
Hero price fetch on `/dashboard`. No indefinite/unbounded loading — every
loading state must resolve to SUCCESS, ERROR, or EMPTY.

## F. Freshness `[CORRECTED]`

Freshness infrastructure already exists at the API layer — a prior session
("audit integritas data 2026-08-03") built `shared/http/freshness.ts`
(`classifyFreshness` for real market-time-based freshness: DELAYED/EOD/
STALE/UNKNOWN, and `describeCacheAge` for cache-age-based freshness:
FRESH/CACHED/STALE) and wired it into `/api/live/[ticker]` (`freshness`
field, computed from Yahoo's real `regularMarketTime`, not server time),
`/api/market-summary` (`_meta: { freshness, cachedAgeSec, cacheTtlSec }`),
and `/api/recommendations` (per-item `_meta` with the same shape). This
work is NOT yet surfaced in `/home`'s UI.

Concretely: `components/MarketMoverCard.tsx` already accepts and renders a
`lastUpdated: string | null` prop ("Update {lastUpdated || '--:--'} • IDX")
but `app/home/page.tsx` hardcodes `lastUpdated={null}` on every call site —
the plumbing exists, it's just not connected. Task is to:
- Pass real freshness/timestamp data from `/api/market-summary`'s `_meta`
  and `/api/live/^JKSE`'s `freshness`/`lastUpdate` into the `lastUpdated`
  prop and into a small label near LensMarket/AI Picks/LensRadar sections.
- If `_meta.freshness === 'STALE'` (or `/api/live` returns `STALE`), switch
  the label to amber + append "Data mungkin sudah tidak terbaru."
- No new API work needed — this section is purely wiring already-computed
  server data into `/home`'s existing render, not fabricating a client-side
  `Date.now()` proxy (the original brainstorm draft assumed no freshness
  data existed at all — that assumption was wrong).

## G. Mobile audit

No Playwright/chromium-cli available in this environment (confirmed absent
again this session, consistent with the 2026-07-31 session note) — this
audit is a **code review of Tailwind breakpoint classes**, not a visual
screenshot pass. Scope: `app/home/page.tsx`, `app/dashboard/page.tsx`,
`components/Sidebar.tsx`, `components/Header.tsx`. Check for: horizontal
overflow (tables/wide flex rows missing `overflow-x-auto`), touch targets
under ~44px on icon-only buttons, and any desktop-only layout that isn't
given a mobile fallback. Concrete findings get fixed inline during
implementation; this doc doesn't pre-list findings since it requires
reading each file's current classes at implementation time. Any user
wanting real device/browser visual verification should be told explicitly
that this build was verified by code review only, not by screenshot.

## Out of scope for BUILD 001

Everything else in the original 25-point spec (LensScore "how is it
calculated" explainer, LensFlow/LensTechnical indicator category grouping
elsewhere, Ask LensAI quick actions, full color/typography/spacing token
audit, table sortable UX beyond what already exists, chart timeframe
selector, CTA hierarchy pass, accessibility audit, empty-state copy pass
sitewide, micro-interactions, disclaimer UX, sitewide design-consistency
audit) is explicitly deferred to BUILD 002 (Brand Integration) or BUILD 003
(Polish), per the user's own roadmap.

## Testing

No new business logic — this is presentation-layer only, consuming
existing API responses. Verification: `tsc --noEmit`, `next build` (all
routes), existing `vitest run` suite must still pass, plus a local dev
server smoke pass (curl status checks + reading server logs) since no
browser automation is available. No new unit tests needed unless a new
non-trivial pure function (e.g. the freshness-staleness threshold check)
is extracted — if so, cover it with a small vitest test.
