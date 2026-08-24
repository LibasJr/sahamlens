-- Internal Decision Lab: append-only signal evidence plus an isolated paper account.
-- No table in this migration can route an order to a real broker. Live execution stays
-- fail-closed in application code until a separately reviewed adapter is configured.

CREATE TABLE IF NOT EXISTS decision_agent_runs (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('ADMIN', 'SCHEDULED')),
  data_as_of TIMESTAMPTZ NOT NULL,
  model_validated BOOLEAN NOT NULL DEFAULT false,
  engine_version TEXT NOT NULL,
  summary JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_decision_agent_runs_created
  ON decision_agent_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS decision_agent_signals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES decision_agent_runs(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('BUY_CANDIDATE', 'WATCH', 'HOLD', 'EXIT_REVIEW', 'NO_SIGNAL')),
  price NUMERIC NOT NULL CHECK (price > 0),
  lens_score NUMERIC NOT NULL CHECK (lens_score >= 0 AND lens_score <= 100),
  coverage_pct NUMERIC,
  paper_readiness TEXT NOT NULL CHECK (paper_readiness IN ('PAPER_READY', 'RESEARCH_ONLY')),
  live_readiness TEXT NOT NULL,
  data_as_of TIMESTAMPTZ NOT NULL,
  stale BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, ticker)
);
CREATE INDEX IF NOT EXISTS idx_decision_agent_signals_ticker_created
  ON decision_agent_signals (ticker, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_agent_signals_action_created
  ON decision_agent_signals (action, created_at DESC);

CREATE TABLE IF NOT EXISTS decision_agent_paper_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cash NUMERIC NOT NULL CHECK (cash >= 0),
  initial_cash NUMERIC NOT NULL CHECK (initial_cash > 0),
  risk_budget_pct NUMERIC NOT NULL CHECK (risk_budget_pct > 0 AND risk_budget_pct <= 5),
  max_position_pct NUMERIC NOT NULL CHECK (max_position_pct > 0 AND max_position_pct <= 25),
  max_open_positions INTEGER NOT NULL CHECK (max_open_positions > 0 AND max_open_positions <= 30),
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS decision_agent_paper_positions (
  account_id TEXT NOT NULL REFERENCES decision_agent_paper_accounts(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  lots INTEGER NOT NULL CHECK (lots >= 0),
  avg_price NUMERIC NOT NULL CHECK (avg_price >= 0),
  last_price NUMERIC NOT NULL CHECK (last_price > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, ticker)
);

CREATE TABLE IF NOT EXISTS decision_agent_orders (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL REFERENCES decision_agent_signals(id),
  account_id TEXT NOT NULL REFERENCES decision_agent_paper_accounts(id),
  ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  lots INTEGER NOT NULL CHECK (lots > 0),
  limit_price NUMERIC NOT NULL CHECK (limit_price > 0),
  status TEXT NOT NULL CHECK (status IN ('PROPOSED', 'EXECUTED', 'REJECTED', 'FAILED')),
  rationale TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  error_message TEXT,
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_decision_agent_orders_status_proposed
  ON decision_agent_orders (status, proposed_at DESC);
