# ADR-002 — Transparency Access Split

Status: Accepted

## Context

SahamLens communicates formula/model transparency, but raw validation diagnostics can include operator-only context. A single admin-only transparency page made the public product promise inconsistent. A single public page would risk leaking raw samples and debugging details.

## Decision

Split transparency into two layers:

1. Public `/transparency` + `/api/transparency`
   - safe model governance disclosure;
   - methodology, status, versions, data as-of, sample counts, limitations, selected provenance;
   - public CDN cache allowed because the response is not session-dependent.

2. Admin `/admin/transparency` + `/api/admin/transparency`
   - raw/full diagnostics payload;
   - authenticated before data is returned;
   - no `publicCacheHeaders`.

## Consequences

- README and public navigation can honestly link to `/transparency`.
- Public users see model status without seeing operator diagnostics.
- Tests must guard both sides: public route stays public and projected; admin route stays authenticated and non-public-cache.
