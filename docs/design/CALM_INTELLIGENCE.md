# SahamLens — Calm Intelligence

Status: beta design direction

## Product promise

SahamLens should help an IDX investor answer three questions in order:

1. **What matters now?**
2. **Why does it matter?**
3. **What evidence supports it?**

The interface should feel calm, precise, and credible even when the underlying research is dense.

## UX hierarchy

Use this default order for research surfaces:

**Context → Opportunity / Risk → Explanation → Evidence → Tools**

Do not lead with a wall of indicators when a short deterministic summary can orient the user first.

## Color semantics

Most of the interface stays neutral.

- Blue: interaction, selection, primary navigation.
- Green: positive market/fundamental state.
- Red: negative/risk state.
- Amber/yellow: caution or incomplete alignment.
- Purple: Lens/AI-specific intelligence only; use sparingly.

Gradients are decorative exceptions, not the default surface treatment.

## Containers

A card represents an object or a decision area. Individual metrics do not automatically need separate cards.

Prefer:

- section separators,
- dividers,
- aligned metric rows,
- whitespace,

before adding another bordered rounded container.

## Navigation

Primary mental model:

- **Utama** — Home, LensMarket, LensRadar, LensWatch.
- **Riset** — Technical, Fundamental, Ownership Flow, Compare.
- **Tools** — Screener, Valuation, Backtest, Risk, portfolio utilities.
- **Intelligence** — News, Calendar, Macro, Transparency, About.

Advanced groups may collapse. Capability remains available without presenting the full sitemap at once.

## Stock research pages

The first useful stock-specific block should explain **what matters about the stock now** before the full chart/analyzer wall.

Then expose the evidence: chart, market/foreign flow, analyzer dimensions, detailed indicators, risk tools, and exports.

Never convert a research score into a transaction recommendation unless the decision/eligibility layer explicitly marks it actionable.

## LensAI

LensAI is a research assistant, not a generic social chatbot.

- Contextual starter questions over generic greetings.
- Explain reasons, risks, and data provenance.
- Keep source/freshness visible.
- Avoid playful interaction chrome that does not help research.
- If verified data is unavailable, say so instead of filling the gap.

## Beta evaluation

During beta, evaluate this direction with behavior rather than visual preference alone:

- time to first useful stock action,
- search-to-analysis conversion,
- LensRadar → stock-analysis click-through,
- percentage of users reaching evidence/detail after reading a summary,
- repeated Watchlist use,
- LensAI questions that reference a visible stock/context,
- support reports where request-id enables fast diagnosis.

Do not add more dashboard density unless these flows show a real information gap.
