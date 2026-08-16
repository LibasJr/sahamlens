-- D-1 Market Data Integrity v1
-- Daily close-price reconciliation between the operational Yahoo feed and an
-- independent secondary source. This table stores evidence; it never rewrites
-- historical market data or silently substitutes one provider for another.

CREATE TABLE IF NOT EXISTS market_data_reconciliation_runs (
  run_id TEXT PRIMARY KEY,
  trade_date DATE,
  primary_source TEXT NOT NULL,
  secondary_source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING','COMPLETED','PARTIAL','FAILED','SKIPPED')),
  universe_count INTEGER NOT NULL DEFAULT 0,
  compared_count INTEGER NOT NULL DEFAULT 0,
  match_count INTEGER NOT NULL DEFAULT 0,
  mismatch_count INTEGER NOT NULL DEFAULT 0,
  primary_only_count INTEGER NOT NULL DEFAULT 0,
  secondary_only_count INTEGER NOT NULL DEFAULT 0,
  no_data_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_market_data_reconciliation_runs_date
  ON market_data_reconciliation_runs (trade_date DESC, started_at DESC);

CREATE TABLE IF NOT EXISTS market_close_reconciliation (
  ticker TEXT NOT NULL,
  trade_date DATE NOT NULL,
  primary_source TEXT NOT NULL,
  secondary_source TEXT NOT NULL,
  primary_close NUMERIC,
  secondary_close NUMERIC,
  diff_abs NUMERIC,
  diff_pct NUMERIC,
  status TEXT NOT NULL CHECK (status IN ('MATCH','MISMATCH','PRIMARY_ONLY','SECONDARY_ONLY','NO_DATA')),
  primary_observed_at TIMESTAMPTZ,
  secondary_observed_at TIMESTAMPTZ,
  run_id TEXT NOT NULL REFERENCES market_data_reconciliation_runs(run_id) ON DELETE RESTRICT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, trade_date, primary_source, secondary_source)
);
CREATE INDEX IF NOT EXISTS idx_market_close_reconciliation_ticker_date
  ON market_close_reconciliation (ticker, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_market_close_reconciliation_status_date
  ON market_close_reconciliation (status, trade_date DESC);
