-- Bank metric collector correction lineage and active-evidence semantics.
-- Historical evidence remains append-only; corrected auto-collected rows are marked
-- superseded instead of being deleted or silently overwritten.

ALTER TABLE bank_metric_evidence
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

ALTER TABLE bank_metric_evidence
  ADD COLUMN IF NOT EXISTS superseded_reason TEXT;

ALTER TABLE bank_metric_evidence
  ADD COLUMN IF NOT EXISTS superseded_by_fingerprint TEXT;

ALTER TABLE bank_metric_collection_runs
  ADD COLUMN IF NOT EXISTS evidence_superseded INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_bank_metric_evidence_active_asof
  ON bank_metric_evidence (ticker, period_end DESC, observed_date DESC, metric_key, created_at DESC)
  WHERE superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bank_metric_evidence_superseded
  ON bank_metric_evidence (superseded_at DESC, ticker, metric_key)
  WHERE superseded_at IS NOT NULL;
