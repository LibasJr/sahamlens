-- Decision Agent 90-day paper pilot.
-- Additive only: existing signals/orders remain readable, live broker execution stays locked.

ALTER TABLE decision_agent_paper_accounts
  ADD COLUMN IF NOT EXISTS max_total_exposure_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS max_sector_exposure_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS max_adv_participation_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS max_drawdown_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS buy_fee_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS sell_fee_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS slippage_bps NUMERIC;

ALTER TABLE decision_agent_paper_accounts
  DROP CONSTRAINT IF EXISTS decision_agent_paper_accounts_max_total_exposure_check,
  ADD CONSTRAINT decision_agent_paper_accounts_max_total_exposure_check
    CHECK (max_total_exposure_pct IS NULL OR (max_total_exposure_pct > 0 AND max_total_exposure_pct <= 100)),
  DROP CONSTRAINT IF EXISTS decision_agent_paper_accounts_max_sector_exposure_check,
  ADD CONSTRAINT decision_agent_paper_accounts_max_sector_exposure_check
    CHECK (max_sector_exposure_pct IS NULL OR (max_sector_exposure_pct > 0 AND max_sector_exposure_pct <= 100)),
  DROP CONSTRAINT IF EXISTS decision_agent_paper_accounts_max_adv_participation_check,
  ADD CONSTRAINT decision_agent_paper_accounts_max_adv_participation_check
    CHECK (max_adv_participation_pct IS NULL OR (max_adv_participation_pct > 0 AND max_adv_participation_pct <= 25)),
  DROP CONSTRAINT IF EXISTS decision_agent_paper_accounts_max_drawdown_check,
  ADD CONSTRAINT decision_agent_paper_accounts_max_drawdown_check
    CHECK (max_drawdown_pct IS NULL OR (max_drawdown_pct > 0 AND max_drawdown_pct <= 100)),
  DROP CONSTRAINT IF EXISTS decision_agent_paper_accounts_buy_fee_check,
  ADD CONSTRAINT decision_agent_paper_accounts_buy_fee_check
    CHECK (buy_fee_pct IS NULL OR (buy_fee_pct >= 0 AND buy_fee_pct <= 5)),
  DROP CONSTRAINT IF EXISTS decision_agent_paper_accounts_sell_fee_check,
  ADD CONSTRAINT decision_agent_paper_accounts_sell_fee_check
    CHECK (sell_fee_pct IS NULL OR (sell_fee_pct >= 0 AND sell_fee_pct <= 5)),
  DROP CONSTRAINT IF EXISTS decision_agent_paper_accounts_slippage_check,
  ADD CONSTRAINT decision_agent_paper_accounts_slippage_check
    CHECK (slippage_bps IS NULL OR (slippage_bps >= 0 AND slippage_bps <= 500));

ALTER TABLE decision_agent_paper_positions
  ADD COLUMN IF NOT EXISTS sector TEXT,
  ADD COLUMN IF NOT EXISTS avg_value_20d NUMERIC,
  ADD COLUMN IF NOT EXISTS observed_mae_pct NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observed_mfe_pct NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE decision_agent_orders
  ADD COLUMN IF NOT EXISTS signal_price NUMERIC,
  ADD COLUMN IF NOT EXISTS fill_price NUMERIC,
  ADD COLUMN IF NOT EXISTS gross_value NUMERIC,
  ADD COLUMN IF NOT EXISTS fee_value NUMERIC,
  ADD COLUMN IF NOT EXISTS slippage_bps NUMERIC,
  ADD COLUMN IF NOT EXISTS price_source TEXT,
  ADD COLUMN IF NOT EXISTS price_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS freshness TEXT,
  ADD COLUMN IF NOT EXISTS sector TEXT,
  ADD COLUMN IF NOT EXISTS avg_value_20d NUMERIC;

CREATE TABLE IF NOT EXISTS decision_agent_theses (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES decision_agent_paper_accounts(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','CLOSED')),
  thesis TEXT NOT NULL,
  invalidation_criteria JSONB NOT NULL,
  catalyst TEXT,
  review_at TIMESTAMPTZ NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type = 'USER_APPROVED'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_agent_theses_active_ticker
  ON decision_agent_theses(account_id, ticker) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS decision_agent_thesis_events (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL REFERENCES decision_agent_theses(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED','UPDATED','CLOSED')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_decision_agent_thesis_events_created
  ON decision_agent_thesis_events(thesis_id, created_at DESC);

CREATE TABLE IF NOT EXISTS decision_agent_paper_round_trips (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES decision_agent_paper_accounts(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  sector TEXT,
  status TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED')),
  entry_signal_id TEXT NOT NULL REFERENCES decision_agent_signals(id),
  exit_signal_id TEXT REFERENCES decision_agent_signals(id),
  buy_lots INTEGER NOT NULL CHECK (buy_lots > 0),
  avg_buy_price NUMERIC NOT NULL CHECK (avg_buy_price > 0),
  gross_buy NUMERIC NOT NULL CHECK (gross_buy > 0),
  buy_fee NUMERIC NOT NULL CHECK (buy_fee >= 0),
  sell_lots INTEGER,
  avg_sell_price NUMERIC,
  gross_sell NUMERIC,
  sell_fee NUMERIC,
  realized_pnl NUMERIC,
  realized_return_pct NUMERIC,
  observed_mae_pct NUMERIC NOT NULL DEFAULT 0,
  observed_mfe_pct NUMERIC NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_agent_round_trips_open_ticker
  ON decision_agent_paper_round_trips(account_id, ticker) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_decision_agent_round_trips_closed
  ON decision_agent_paper_round_trips(account_id, closed_at DESC) WHERE status = 'CLOSED';

CREATE TABLE IF NOT EXISTS decision_agent_paper_nav_snapshots (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES decision_agent_paper_accounts(id) ON DELETE CASCADE,
  nav NUMERIC NOT NULL CHECK (nav >= 0),
  cash NUMERIC NOT NULL CHECK (cash >= 0),
  positions_value NUMERIC NOT NULL CHECK (positions_value >= 0),
  source TEXT NOT NULL CHECK (source IN ('SCAN','ORDER')),
  observed_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decision_agent_nav_snapshots_observed
  ON decision_agent_paper_nav_snapshots(account_id, observed_at);
