# SahamLens TP/CL Round 3 — Genuine Forward OOS

## Freeze
- Freeze date: 2026-08-07
- Frozen production parameter version: tpcl-production-v1.0.0
- Baseline parameters:
  - support buffer 0.25 ATR
  - min stop distance 0.75 ATR
  - fallback 1.5 ATR
  - min RR 1.5
  - TP1 2R
  - TP2 3R

## Genuine OOS rules
- Only `signalDate > 2026-08-07` can enter OOS.
- Historical signals on/before freeze are NEVER backfilled as OOS.
- Return must mature to T+20 before metrics count.
- Production baseline uses the exact same `buildLongTradingSetup()` engine.
- `ALL_BASELINE` and `EXCLUDE_BEAR` are separate predeclared protocols.
- Results must not be combined after seeing outcomes.

## Status
- WAITING_FOR_MATURITY: no post-freeze T+20 mature signals yet.
- INSUFFICIENT_DATA: mature data exists but executable N < 30.
- POSITIVE: N >= 30, expectancy > 0 and PF > 1.
- NEGATIVE: N >= 30 but expectancy/PF not positive.

These statuses do NOT auto-promote production.

## No automatic actions
- no parameter updates
- no BEAR filter activation
- no threshold changes
- no production writes
- no backfill

## Important
`EXCLUDE_BEAR` is a candidate protocol only. It remains disabled in production unless
future governance explicitly approves it after sufficient genuine OOS evidence.
