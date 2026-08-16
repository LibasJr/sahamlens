-- Automated official-source discovery audit trail for bank-specific metrics.
-- Collector remains DATA_ONLY and fail-closed: only verified, unambiguous candidates
-- may be copied to bank_metric_evidence.

CREATE TABLE IF NOT EXISTS bank_metric_collection_runs (
  run_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('DRY_RUN','CONFIRM')),
  status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCESS','PARTIAL','FAILED')),
  tickers TEXT[] NOT NULL DEFAULT '{}',
  source_pages_checked INTEGER NOT NULL DEFAULT 0,
  documents_discovered INTEGER NOT NULL DEFAULT 0,
  documents_parsed INTEGER NOT NULL DEFAULT 0,
  evidence_candidates INTEGER NOT NULL DEFAULT 0,
  evidence_inserted INTEGER NOT NULL DEFAULT 0,
  evidence_existing INTEGER NOT NULL DEFAULT 0,
  quarantined INTEGER NOT NULL DEFAULT 0,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS bank_metric_collection_candidates (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES bank_metric_collection_runs(run_id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  period_end DATE,
  observed_date DATE NOT NULL,
  metric_key TEXT NOT NULL,
  value NUMERIC,
  unit TEXT,
  basis TEXT,
  confidence NUMERIC,
  extraction_method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('INGESTED','EXISTING','QUARANTINED')),
  reason TEXT,
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_tier TEXT NOT NULL DEFAULT 'ISSUER_IR',
  raw_excerpt TEXT,
  evidence_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_metric_collection_runs_started
  ON bank_metric_collection_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_metric_collection_candidates_run
  ON bank_metric_collection_candidates (run_id, ticker, status, metric_key);
CREATE INDEX IF NOT EXISTS idx_bank_metric_collection_candidates_ticker
  ON bank_metric_collection_candidates (ticker, period_end DESC, metric_key, created_at DESC);
