-- Frozen 90-day pilot controls, official sector evidence, and actual broker-cost ledger.
-- No live broker credentials or execution capability are introduced here.

CREATE TABLE IF NOT EXISTS decision_agent_pilot_protocols (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES decision_agent_paper_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','COMPLETED')),
  started_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  frozen_at TIMESTAMPTZ NOT NULL,
  engine_version TEXT NOT NULL,
  policy_snapshot JSONB NOT NULL,
  CHECK (ends_at > started_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_pilot_active
  ON decision_agent_pilot_protocols(account_id) WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS idx_ic_classifications (
  ticker TEXT PRIMARY KEY,
  sector_code TEXT,
  sector_name TEXT NOT NULL,
  subsector_name TEXT,
  industry_name TEXT,
  subindustry_name TEXT,
  source_name TEXT NOT NULL CHECK (source_name = 'IDX'),
  source_url TEXT NOT NULL,
  source_as_of DATE NOT NULL,
  source_file_sha256 TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_idx_ic_source_as_of ON idx_ic_classifications(source_as_of DESC);

CREATE TABLE IF NOT EXISTS decision_agent_broker_imports (
  id TEXT PRIMARY KEY,
  broker TEXT NOT NULL CHECK (broker='STOCKBIT'),
  source_type TEXT NOT NULL CHECK (source_type IN ('TRANSACTION_HISTORY','E_STATEMENT')),
  source_filename TEXT NOT NULL,
  source_sha256 TEXT NOT NULL UNIQUE,
  period_start DATE,
  period_end DATE,
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decision_agent_broker_transactions (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES decision_agent_broker_imports(id) ON DELETE CASCADE,
  trade_date DATE NOT NULL,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  lots INTEGER NOT NULL CHECK (lots > 0),
  price NUMERIC NOT NULL CHECK (price > 0),
  gross_value NUMERIC NOT NULL CHECK (gross_value > 0),
  fee_value NUMERIC CHECK (fee_value IS NULL OR fee_value >= 0),
  source_row INTEGER NOT NULL CHECK (source_row > 0),
  reconciliation_status TEXT NOT NULL CHECK (reconciliation_status IN ('MATCHED','UNMATCHED')),
  matched_order_id TEXT REFERENCES decision_agent_orders(id),
  UNIQUE(import_id, source_row)
);

CREATE TABLE IF NOT EXISTS decision_agent_paper_costs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES decision_agent_paper_accounts(id) ON DELETE CASCADE,
  cost_type TEXT NOT NULL CHECK (cost_type IN ('STAMP_DUTY','DATAFEED','BROKER_ADJUSTMENT')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  observed_date DATE NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('STOCKBIT_RULE','BROKER_IMPORT')),
  source_reference TEXT NOT NULL,
  import_id TEXT REFERENCES decision_agent_broker_imports(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, cost_type, observed_date, source_reference)
);

ALTER TABLE decision_agent_paper_nav_snapshots
  DROP CONSTRAINT IF EXISTS decision_agent_paper_nav_snapshots_source_check,
  ADD CONSTRAINT decision_agent_paper_nav_snapshots_source_check
    CHECK (source IN ('SCAN','ORDER','COST','RECONCILIATION'));
