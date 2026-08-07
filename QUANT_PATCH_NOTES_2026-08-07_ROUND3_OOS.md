# SahamLens Quant Patch Round 3 — Forward/OOS Protocol

- Adds explicit forward-only OOS protocol `oos-v1.0` frozen at 2026-08-07.
- Historical observations before freeze can never be backfilled/re-labelled as genuine OOS.
- Genuine OOS accepts only signals after freeze whose T+20 exit has matured.
- Fail-closed minimum: 30 effective observations in both 80-100 and <60 buckets before PASS/FAIL gate is evaluated.
- PASS requires positive spread, supportive block-bootstrap CI, permutation p <= 0.05, positive IC, and >=2 monotonic bucket steps.
- PASS never auto-promotes production status or changes weights/thresholds; manual review remains required.
- Adds retrospective contiguous temporal fold diagnostic, explicitly labelled NOT genuine OOS.
