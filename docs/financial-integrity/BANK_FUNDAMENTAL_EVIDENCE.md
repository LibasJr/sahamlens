# Bank Fundamental Evidence

Bank-specific metrics are stored as **one evidence row per metric**, not as a single blended bank snapshot. This prevents NPL, CASA, CAR, LDR, NIM, credit cost, and PPOP from being silently mixed across different disclosure bases or source documents.

## Guardrails

- `observed_date` is when SahamLens can prove the evidence was available to this pipeline. It is not backdated to the reporting period.
- `period_end` is the financial period measured by the metric.
- `basis` is explicit: `BANK_ONLY`, `CONSOLIDATED`, or `DISCLOSED_UNSPECIFIED`.
- `REPORTED` and `DERIVED` evidence are separate.
- Import is append-only and idempotent by `evidence_fingerprint`.
- `NPL_NET_PCT > NPL_GROSS_PCT` is rejected when both appear in the same ticker/period/basis batch.
- `PPOP_IDR` must be normalized to full rupiah.
- Evidence remains `DATA_ONLY`; it does not change LensScore until a dedicated bank model has sufficient historical PIT coverage and validation.

## Import

Dry run:

```bash
node scripts/import-bank-metric-evidence.mjs \
  --file data/financials/bank-metric-evidence-pilot-2026-08.csv
```

Confirm only after reviewing the source pages and basis labels:

```bash
NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection" \
node --env-file=.env.production \
  scripts/import-bank-metric-evidence.mjs \
  --file data/financials/bank-metric-evidence-pilot-2026-08.csv \
  --confirm
```
