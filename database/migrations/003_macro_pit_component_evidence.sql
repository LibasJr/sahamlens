-- SahamLens macro PIT component evidence
--
-- Tujuan: memisahkan provenance setiap input valuasi. Risk-free, ERP, dan
-- perpetual-growth cap TIDAK boleh lagi tampak seolah berasal dari satu sumber.
-- Production valuation tetap frozen sampai model-version adoption eksplisit.

CREATE TABLE IF NOT EXISTS macro_input_evidence (
  id BIGSERIAL PRIMARY KEY,
  input_key TEXT NOT NULL CHECK (input_key IN (
    'RISK_FREE_RATE_PCT',
    'EQUITY_RISK_PREMIUM_PCT',
    'MAX_PERPETUAL_GROWTH_PCT',
    'BI_RATE_PCT',
    'INFLATION_TARGET_MID_PCT',
    'INFLATION_TARGET_UPPER_PCT'
  )),
  value_pct NUMERIC NOT NULL,
  market_date DATE,
  observed_date DATE NOT NULL,
  usable_from_date DATE NOT NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN (
    'MARKET_OBSERVATION',
    'RESEARCH_ESTIMATE',
    'POLICY_TARGET',
    'POLICY_RATE',
    'MODEL_POLICY'
  )),
  source_tier TEXT NOT NULL CHECK (source_tier IN (
    'GOVERNMENT_OFFICIAL',
    'ACADEMIC_RESEARCH',
    'INTERNAL_MODEL_POLICY'
  )),
  source_name TEXT NOT NULL,
  source_url TEXT,
  methodology TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (value_pct >= 0 AND value_pct <= 30),
  CHECK (market_date IS NULL OR market_date <= observed_date),
  CHECK (observed_date <= usable_from_date),
  CHECK (
    (source_tier = 'INTERNAL_MODEL_POLICY') OR
    (source_url IS NOT NULL AND source_url ~ '^https://')
  ),
  UNIQUE (input_key, usable_from_date, source_name)
);

CREATE INDEX IF NOT EXISTS idx_macro_input_evidence_asof
  ON macro_input_evidence (input_key, usable_from_date DESC, observed_date DESC, id DESC);

COMMENT ON TABLE macro_input_evidence IS
  'Point-in-time evidence per macro/model input. market_date=data date, observed_date=public availability, usable_from_date=first date SahamLens may use it without look-ahead.';
COMMENT ON COLUMN macro_input_evidence.usable_from_date IS
  'Must be >= observed_date. As-of queries filter on this field to prevent look-ahead.';
COMMENT ON COLUMN macro_input_evidence.evidence_type IS
  'MODEL_POLICY is not market evidence and must never be represented as such in UI/model audit.';
