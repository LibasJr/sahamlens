-- Persist compact recommendation/scoring audit snapshots.
-- Runtime code must not create this table implicitly; deploy must run db:migrate.

CREATE TABLE IF NOT EXISTS recommendation_audit_trail (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL,
  model_version TEXT NOT NULL,
  score_config_hash TEXT NOT NULL,
  source_id TEXT NOT NULL,
  data_observed_at TIMESTAMPTZ,
  calculated_at TIMESTAMPTZ NOT NULL,
  total_score NUMERIC NOT NULL,
  category TEXT NOT NULL,
  coverage_pct NUMERIC NOT NULL,
  confidence_pct NUMERIC NOT NULL,
  advisory BOOLEAN NOT NULL,
  action TEXT,
  data_quality JSONB NOT NULL,
  input_snapshot JSONB NOT NULL,
  decision_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_audit_ticker_created
  ON recommendation_audit_trail (ticker, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendation_audit_model_created
  ON recommendation_audit_trail (model_version, score_config_hash, created_at DESC);

COMMENT ON TABLE recommendation_audit_trail IS
'Compact audit trail for stock analysis/recommendation outputs. Stores source freshness, LensScore model identity, score, decision, and input snapshot keys/values for later review.';
