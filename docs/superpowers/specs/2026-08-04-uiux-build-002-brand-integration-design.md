# UI/UX BUILD 002 — Brand Integration Design

Status: approved by user 2026-08-04, ready for implementation plan.

## Context

Continuation of the same 25-point UI/UX audit spec used for BUILD 001
(spec: `docs/superpowers/specs/2026-08-04-uiux-build-001-foundation-design.md`).
This doc covers **BUILD 002 — Brand Integration only** (spec P1 items
8-15, 19). BUILD 003 (Polish) remains a separate future spec.

Same guardrails as BUILD 001 apply: no full redesign, no framework/library
swap, no changes to existing financial formulas beyond the additive,
clearly-scoped exception in section A below, no feature removal, no route
changes, no heavy animation, no dummy data.

## Scope decisions

- **Item 12 (Ask LensAI) is explicitly deferred to BUILD 003** — it has
  its own line in the user's original roadmap ("BUILD 003 — Ask LensAI
  experience"), not part of Brand Integration.
- **Item 11 (LensTechnical indicator grouping) stays skipped**, same
  conclusion as BUILD 001: `/dashboard` is "10 Pure Math Filters" (named
  trading methods), not a flat raw-indicator readout panel. No grouping
  work applies here.
- **Items 13/14 (semantic color, typography)**: light audit only, not a
  sweeping recolor/retype pass. Findings below; no broad file changes.
- **Item 15 (card system)**: extend via composition (className presets on
  the existing `Card` component), not new component variants or a
  component-library rewrite.

## A. LensScore — 5-category breakdown (spec item 8)

Current state (`app/dashboard/page.tsx`'s AI Summary block, `data.scoring`
from `/api/stock/[ticker]`): 3 categories only — Technical (0-40),
Fundamental (0-30), Flow (0-30), summing to `total_score` (0-100) with
`kategori` (STRONG BUY/BUY/HOLD/SELL). No Momentum or Risk score exists
anywhere in the codebase.

Finding: `analyzeMomentum` and `analyzeVolatility` (from
`modules/technical`) are **already computed** inside the same
`/api/stock/[ticker]` request that produces `data.scoring` (confirmed at
`app/api/stock/[ticker]/route.ts:271-272`) and are **already sent to the
client** as part of the `analyzers` array (the same array `/dashboard`
already reads from for its "MA Trend" status badge via
`analyzers.find(a => a.label?.includes(...))`). No new backend
computation or API changes are needed — this is a client-side derived
display addition only, same pattern as BUILD 001's freshness work.

**Explicit non-goal:** `total_score` and `kategori` (the BUY/SELL/HOLD
decision) are NOT touched. Momentum and Risk are additive display
categories only.

Formulas (approved by user):
- **Momentum score (0-100)**: from the `analyzeMomentum` analyzer entry
  (`label: 'Momentum 1D/5D'`, has `decision` and `confidence` 0-99).
  - `decision === 'BULLISH'` → `confidence`
  - `decision === 'BEARISH'` → `100 - confidence`
  - `decision === 'NEUTRAL'` → `50`
- **Risk score (0-100, higher = safer)**: from the `analyzeVolatility`
  analyzer entry (`label: 'Volatility (ATR 14)'`, has `raw.atr` and
  `confidence`). Recompute `volatilityPct = (raw.atr / currentPrice) * 100`
  (same division the analyzer itself does internally, current price
  already available in `data.stock.current_price`). Then:
  `riskScore = Math.max(0, Math.min(100, 100 - volatilityPct * 15))`
  — calibrated so ~1.5% ATR (the analyzer's own "low volatility"
  threshold) lands around 78, ~3% ATR (the analyzer's own "high
  volatility" threshold) lands around 55, giving reasonable spread
  without a discontinuity at the analyzer's thresholds.

New file: `lib/utils/lens-score-breakdown.ts` — pure functions
`momentumScore(analyzers)` and `riskScore(analyzers, currentPrice)`,
each returning `number | null` (null when the analyzer entry is missing,
e.g. insufficient history) so the UI can omit the bar rather than show a
fake 0.

UI: extend the existing AI Summary breakdown bars (`app/dashboard/page.tsx`,
the "BREAKDOWN SKOR" section) from 3 to 5 rows: Technical, Momentum,
Money Flow (renamed from "Arus Dana" label to match spec's English-style
brand consistency — keep the Indonesian description elsewhere per item 19
pattern), Fundamental, Risk. Bar max value for the two new rows is 100
(vs the existing rows' 40/30/30 scale) — render as percentage-of-100
width like the others already do (`width: ${score}%`).

## B. LensRadar — inline top reason (spec item 9)

Current cards (`app/home/page.tsx` LensRadar section, `app/breakout-radar/page.tsx`
table) already show: ticker, price/change (breakout-radar table only —
`/home`'s card omits price, see note below), LensScore (`finalScore`),
1 reason (only on `/home`'s card; `breakout-radar`'s table hides all
reasons behind a click-to-expand row).

Change: `app/breakout-radar/page.tsx` — show the single top reason
(`it.topReasons?.[0]`) inline in the main row (small muted text under the
ticker, same pattern already used on `/home`'s LensRadar card from BUILD
001), keeping the full breakdown (Technical/Fundamental/Flow scores + all
reasons) behind the existing expand toggle. This matches spec item 9's
"detail indikator hanya di stock detail" — the expand affordance already
serves that role, just needs the *first* reason visible without a click.

No change to `/home`'s LensRadar card (already shows ticker + score + 1
reason from BUILD 001); optionally add price/change there too since
`/api/ai-pick`'s items already include `price`/`changePct` (confirmed in
`AiPickItem` type, `app/breakout-radar/page.tsx:15-29`) but the `/home`
card doesn't render them — small additive fix.

## C. LensFlow — 5-tier status (spec item 10)

Current (`components/BandarFlowPro.tsx`): 3 states only — `AKUMULASI`,
`DISTRIBUSI`, `NETRAL` (from `/api/flow/[ticker]`'s `summary.status`).
`summary.streak` (consecutive days) is already computed and already used
to show a "🔥 N HARI" badge when `streak >= 3`.

Change: derive a 5-tier label client-side, no API/formula change:
- `AKUMULASI` + `streak >= 3` → **STRONG ACCUMULATION**
- `AKUMULASI` + `streak < 3` → **ACCUMULATION**
- `NETRAL` → **NEUTRAL**
- `DISTRIBUSI` + `streak < 3` → **DISTRIBUTION**
- `DISTRIBUSI` + `streak >= 3` → **STRONG DISTRIBUTION**

Reuse the existing `insightColor`/`insightBadge` pattern in
`BandarFlowPro.tsx` (currently keyed by `summary.status`), extend it to
key by the derived 5-tier value instead — same visual language (green
family for accumulation tiers, red family for distribution tiers, just
the STRONG variants get a filled/bolder badge vs the regular tier's
outline badge, no new color introduced).

Also align the panel's English-style brand line to the spec's exact
copy pattern (item 19): currently
`"LensFlow — Bandar & Arus Dana"` / `"Estimasi arus dana dari volume
transaksi - bukan data broker resmi"` → keep the em-dash heading but
align the subtitle wording closer to spec's suggested
`"LensFlow — Analisis Money Flow"` framing without dropping the existing,
more specific "bukan data broker resmi" disclaimer (that disclaimer is
load-bearing honesty copy from a prior data-integrity audit, not
decorative — keep it verbatim, just adjust the heading line).

## D. Semantic color / typography audit (spec items 13/14)

Audit finding: `tv-green` is used across 42 files. Reading a representative
sample, the usage is overwhelmingly semantic (price up, bullish
consensus, accumulation, positive P/L) — consistent with spec intent.

One borderline pattern found: a pulsing green dot used for "live/connected"
status (`components/Sidebar.tsx` footer "IDX Live Feed", LensMarket's
badge dot pattern, `/breakout-radar`'s "Live" badge). This is
connectivity/freshness status, not a bullish/bearish signal — arguably
still semantic (green = good/active, red/neutral = not) rather than
purely decorative brand use. Given changing an established, working
status-indicator pattern across multiple components is a large diff for
a purely cosmetic, debatable gain, **no change made here** — documented
as a conscious decision, not an oversight.

No sweeping recolor or typography changes beyond what sections A-C above
already do naturally by reusing existing tokens.

## E. Card system composition (spec item 15)

No new component. `components/ui/Card.tsx` already has `variant`
(`default`/`glass`/`flat`), `hoverable`, `padding` props — sufficient
primitive. Document two composition presets (className combinations) for
consistent use going forward, applied to the LensFlow status card
(section C) and LensRadar cards (section B) as the first real usages:

- **Signal Card** preset: `<Card className="border-l-4 border-l-{accent}">`
  — a colored left border matching the signal's semantic color (green for
  accumulation/bullish, red for distribution/bearish, amber for
  neutral/watch), on top of the existing default card styling. Used for
  LensRadar's per-item rows and LensFlow's status panel.
- **Alert Card** preset: `<Card className="border-tv-warning/40 bg-tv-warning/5">`
  — for warning/flagged states (e.g. LensRadar's `flagged` contradictory-signal
  rows, already rendered with an inline `!` marker in BUILD 001 — this
  preset gives it a full card treatment if/when it needs one beyond the
  inline marker; not force-applied everywhere).

These are documented Tailwind class conventions, not new TypeScript props
or components — zero risk of breaking the existing `Card` API.

## F. Language pattern pass (spec item 19)

Building on BUILD 001's "Name — Description" subtitle work
(`/breakout-radar`, `/screener`, `/watchlist`): apply the same pattern to
`BandarFlowPro`'s heading per section C above. No other pages currently
lack a subtitle in a way that blocks this pattern (confirmed during
BUILD 001).

## Testing

`momentumScore`/`riskScore` in `lib/utils/lens-score-breakdown.ts` are new
non-trivial pure functions — covered with vitest unit tests (TDD), same
approach as BUILD 001's `formatFreshnessLabel`. Everything else in this
build is presentation-layer composition of already-computed data with no
new pure logic, verified via `tsc --noEmit`, `next build`, existing
`vitest run` suite, and a dev-server smoke pass (no browser automation
available, same limitation noted in BUILD 001).

## Out of scope for BUILD 002

Ask LensAI experience (item 12, → BUILD 003), LensTechnical grouping
(item 11, not applicable), sitewide color/typography rewrite (items
13/14, light audit only per section D), full card-system component
rewrite (item 15, composition only per section E), accessibility audit
(item 20), empty states beyond what BUILD 001 already added (item 21),
micro-interactions (item 22), performance perception beyond BUILD 001
(item 23), disclaimer UX (item 24), sitewide design-consistency audit
(item 25) — all remain BUILD 003 or later.
