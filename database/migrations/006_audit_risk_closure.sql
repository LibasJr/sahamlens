-- SahamLens audit risk closure (2026-08-17)
-- IMPORTANT: schema additions are isolated in a NEW migration so checksums of already
-- applied migrations stay unchanged on existing VPS databases.

ALTER TABLE fundamental_history
  ADD COLUMN IF NOT EXISTS shares_outstanding NUMERIC,
  ADD COLUMN IF NOT EXISTS market_cap NUMERIC;

ALTER TABLE lens_radar_history
  ADD COLUMN IF NOT EXISTS eligibility_status TEXT,
  ADD COLUMN IF NOT EXISTS eligibility_reason_codes TEXT,
  ADD COLUMN IF NOT EXISTS technical_available_max NUMERIC,
  ADD COLUMN IF NOT EXISTS fundamental_available_max NUMERIC,
  ADD COLUMN IF NOT EXISTS flow_available_max NUMERIC,
  ADD COLUMN IF NOT EXISTS universe_eligible BOOLEAN,
  ADD COLUMN IF NOT EXISTS universe_reason_codes TEXT,
  ADD COLUMN IF NOT EXISTS universe_avg_close_63d NUMERIC,
  ADD COLUMN IF NOT EXISTS universe_avg_value_63d NUMERIC,
  ADD COLUMN IF NOT EXISTS universe_annual_vol_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS universe_method_version TEXT;

ALTER TABLE broker_summary_daily
  ADD COLUMN IF NOT EXISTS buy_volume BIGINT,
  ADD COLUMN IF NOT EXISTS sell_volume BIGINT,
  ADD COLUMN IF NOT EXISTS buy_frequency BIGINT,
  ADD COLUMN IF NOT EXISTS sell_frequency BIGINT;

CREATE INDEX IF NOT EXISTS idx_lens_radar_history_pit_validation
  ON lens_radar_history (score_version, date, ticker)
  WHERE universe_eligible = TRUE AND eligibility_status = 'ELIGIBLE';

CREATE INDEX IF NOT EXISTS idx_fundamental_history_pit_market_cap
  ON fundamental_history (ticker, observed_date DESC)
  WHERE shares_outstanding IS NOT NULL OR market_cap IS NOT NULL;
