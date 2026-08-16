-- SahamLens production hardening baseline.
-- Additive/idempotent only: no destructive DROP, no speculative financial values.

ALTER TABLE IF EXISTS admin_secret
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  target TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_jti TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_created
  ON admin_audit_events (created_at DESC);

CREATE TABLE IF NOT EXISTS bank_fundamental_history (
  ticker TEXT NOT NULL,
  observed_date DATE NOT NULL,
  period_end DATE NOT NULL,
  published_at TIMESTAMPTZ,
  nim_pct NUMERIC,
  npl_gross_pct NUMERIC,
  npl_net_pct NUMERIC,
  casa_pct NUMERIC,
  car_pct NUMERIC,
  ldr_pct NUMERIC,
  cost_of_credit_pct NUMERIC,
  cost_to_income_pct NUMERIC,
  coverage_ratio_pct NUMERIC,
  ppop_idr NUMERIC CHECK (ppop_idr IS NULL OR ppop_idr >= 0),
  source TEXT NOT NULL,
  source_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, observed_date, period_end, source)
);
CREATE INDEX IF NOT EXISTS idx_bank_fundamental_asof
  ON bank_fundamental_history (ticker, observed_date DESC, period_end DESC);

CREATE TABLE IF NOT EXISTS macro_assumption_history (
  id BIGSERIAL PRIMARY KEY,
  effective_date DATE NOT NULL,
  observed_date DATE NOT NULL,
  risk_free_rate_pct NUMERIC NOT NULL,
  equity_risk_premium_pct NUMERIC NOT NULL,
  max_perpetual_growth_pct NUMERIC NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (effective_date, source),
  CHECK (observed_date <= effective_date),
  CHECK (risk_free_rate_pct >= 0 AND risk_free_rate_pct <= 30),
  CHECK (equity_risk_premium_pct > 0 AND equity_risk_premium_pct <= 30),
  CHECK (max_perpetual_growth_pct >= 0 AND max_perpetual_growth_pct <= 15)
);
CREATE INDEX IF NOT EXISTS idx_macro_assumption_effective
  ON macro_assumption_history (effective_date DESC, observed_date DESC);

CREATE TABLE IF NOT EXISTS tpcl_validation_runs (
  id UUID PRIMARY KEY,
  history_range TEXT NOT NULL CHECK (history_range IN ('1y','3y','5y','10y')),
  status TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED')),
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  protocol_version TEXT,
  score_version TEXT,
  parameter_fingerprint TEXT,
  dataset_fingerprint TEXT,
  result JSONB,
  error_message TEXT,
  requested_by TEXT NOT NULL DEFAULT 'admin'
);
CREATE INDEX IF NOT EXISTS idx_tpcl_validation_runs_requested
  ON tpcl_validation_runs (requested_at DESC);

CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  plan_code TEXT NOT NULL,
  amount_idr BIGINT,
  status TEXT NOT NULL CHECK (status IN ('PENDING','CLAIMED','PAID','REJECTED','CANCELLED')),
  external_reference TEXT,
  claim_channel TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  reconciled_by TEXT,
  reconciliation_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status_created
  ON payment_orders (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_external_reference
  ON payment_orders (external_reference) WHERE external_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS data_source_health (
  source_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('HEALTHY','DEGRADED','DOWN','UNKNOWN')),
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_latency_ms INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  data_observed_at TIMESTAMPTZ,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
