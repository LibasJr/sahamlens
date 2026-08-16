-- Ownership Flow data-quality quarantine.
-- Additive only. Rejected KSEI rows are preserved for audit but never become
-- ownership_flow_history observations and therefore never feed deltas/LensAI.

CREATE TABLE IF NOT EXISTS ownership_flow_quarantine (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT,
  observed_date DATE,
  source TEXT NOT NULL,
  source_url TEXT,
  line_number INTEGER,
  reason_code TEXT NOT NULL,
  reason TEXT NOT NULL,
  raw_fingerprint TEXT NOT NULL,
  raw_row JSONB NOT NULL,
  total_securities NUMERIC(24,0),
  local_shares NUMERIC(24,0),
  foreign_shares NUMERIC(24,0),
  fetched_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ownership_flow_quarantine_date
  ON ownership_flow_quarantine (observed_date DESC, source);
CREATE INDEX IF NOT EXISTS idx_ownership_flow_quarantine_ticker
  ON ownership_flow_quarantine (ticker, observed_date DESC)
  WHERE ticker IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ownership_flow_quarantine_identity
  ON ownership_flow_quarantine (source, COALESCE(observed_date, DATE '0001-01-01'), COALESCE(ticker, ''), reason_code, raw_fingerprint);
