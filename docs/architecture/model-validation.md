# Model Validation and Transparency

SahamLens separates public governance disclosure from internal operator diagnostics.

## Public layer

Public users can open `/transparency` and call `/api/transparency` without an admin session.
That layer is intentionally limited to information that is useful for model governance and safe to cache publicly:

- methodology/formula summary;
- model status (`RESEARCH_ONLY`, `MODEL_UNVALIDATED`, `NON_ACTIONABLE`, or a future validated status);
- score/config/price-basis versions;
- data as-of and latest aggregate run date;
- sample counts and OOS validation status;
- return basis and known limitations;
- selected metric provenance, such as the source and confidence of high-bucket Avg T+20.

The public layer must not expose raw samples, anomalous rows, per-row calibration details, operator diagnostics, secrets, or private user/session data.

## Admin layer

Admins use `/admin/transparency` and `/api/admin/transparency` for the full diagnostics payload.
That endpoint stays authenticated and must not use `publicCacheHeaders`, because a session-dependent response must never be cached as a public CDN object.

## Current model posture

LensScore/LensRadar outputs remain research-only and non-actionable until auditable out-of-sample validation passes. Backtests and bucket statistics are evidence, not investment advice.

Current public copy must preserve these concepts:

- `RESEARCH_ONLY`
- `MODEL_UNVALIDATED`
- `NON_ACTIONABLE`
- OOS validation pending/failed/validated status
- return basis: entry Open H+1, exit T+N trading days, with stated fees/slippage where applicable

## Provenance rule

Important financial numbers should be able to answer: “where did this number come from and when?”

Use `shared/finance/provenance.ts` for first-class provenance fields when adding new traceable metrics. Do not fabricate provenance: if the source/time/context is missing, mark it explicitly with `confidence: 'unknown'` or a more specific non-official confidence.
