# TP/CL Validation Lab Round 2.2

Adds diagnostics only. No production parameter changes.

## New
- Correct worst-tail MAE percentile (signed MAE => 5th percentile).
- Eligibility funnel from raw LensScore>=80 to executable TP/CL trades.
- Robustness status:
  - ROBUST
  - UNSTABLE
  - NEGATIVE_VALIDATION
  - INSUFFICIENT_DATA
- BEAR regime filter counterfactual:
  compares all trades vs excluding BEAR vs BEAR only.

## Important
The BEAR filter is diagnostic only and is NOT auto-applied.
No parameter optimizer, no production writes, no automatic regime gate.

Round 2.2 remains retrospective research, not genuine OOS.

- Funnel stages are mutually exclusive; counts should reconcile to rawSignals.
