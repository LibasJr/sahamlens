-- Bank-specific fundamental evidence, normalized per metric.
-- Additive only. The older bank_fundamental_history table remains as legacy fallback.

CREATE TABLE IF NOT EXISTS bank_metric_evidence (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL,
  period_end DATE NOT NULL,
  observed_date DATE NOT NULL,
  published_at TIMESTAMPTZ,
  source_document_date DATE,
  metric_key TEXT NOT NULL CHECK (metric_key IN (
    'NIM_PCT','NPL_GROSS_PCT','NPL_NET_PCT','CASA_PCT','CAR_PCT','LDR_PCT',
    'COST_OF_CREDIT_PCT','COST_TO_INCOME_PCT','COVERAGE_RATIO_PCT','PPOP_IDR'
  )),
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('PCT','IDR')),
  basis TEXT NOT NULL CHECK (basis IN ('BANK_ONLY','CONSOLIDATED','DISCLOSED_UNSPECIFIED')),
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('REPORTED','DERIVED')),
  source_tier TEXT NOT NULL CHECK (source_tier IN ('ISSUER_IR','IDX_FILING','OJK','OTHER_OFFICIAL')),
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  notes TEXT,
  evidence_fingerprint TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (observed_date >= period_end)
);

CREATE INDEX IF NOT EXISTS idx_bank_metric_evidence_asof
  ON bank_metric_evidence (ticker, observed_date DESC, period_end DESC, metric_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_metric_evidence_period
  ON bank_metric_evidence (ticker, period_end DESC, metric_key);
CREATE INDEX IF NOT EXISTS idx_bank_metric_evidence_source
  ON bank_metric_evidence (source_tier, observed_date DESC);
