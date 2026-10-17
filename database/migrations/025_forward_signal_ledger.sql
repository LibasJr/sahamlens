-- Forward paper-trade signal ledger dan tabel outcome append-only (OOS maju, tanpa lookahead).
--
-- KENAPA TABEL INI ADA. Backtest historis tercemar karena kolom lens_* di lens_radar_history
-- pernah ditulis ulang (Agu-Sep 2026) dan regime filter gugur (PR #533). Satu-satunya bukti
-- validitas model yang jujur adalah sinyal yang dibekukan SAAT sesi berjalan (point-in-time),
-- lalu dievaluasi belakangan setelah horizon T+5 dan T+20 lewat.
--
-- Dua tabel terpisah:
-- 1. forward_signal_ledger: mencatat SEMUA sinyal harian saat sesi penutupan, termasuk
--    komponen skor yang dibekukan, entry acuan sesi berikutnya (paper-fill adverse slippage + tick),
--    stop, target (RR >= 1:1.8), dan flag likuiditas universe (ADV >= Rp 1 Milyar).
-- 2. forward_signal_outcome: diisi oleh job terpisah HANYA setelah horizon T+5 / T+20 lewat.
--    Tabel sinyal tidak pernah diubah. Kedua tabel dilindungi trigger penegak append-only (UPDATE/DELETE dilarang).

CREATE TABLE IF NOT EXISTS forward_signal_ledger (
  signal_id TEXT PRIMARY KEY,
  emitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trade_date DATE NOT NULL,
  ticker TEXT NOT NULL,
  action TEXT NOT NULL,
  lens_score NUMERIC NOT NULL,
  technical_score NUMERIC,
  fundamental_score NUMERIC,
  flow_score NUMERIC,
  coverage_pct NUMERIC,
  close_price NUMERIC NOT NULL,
  entry_ref NUMERIC NOT NULL,
  stop NUMERIC,
  target NUMERIC,
  risk_reward NUMERIC,
  model_version TEXT NOT NULL,
  git_sha TEXT,
  avg_value_20d NUMERIC,
  universe_flag BOOLEAN NOT NULL DEFAULT false,
  is_baseline BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_forward_ledger_date_ticker_model UNIQUE (trade_date, ticker, model_version)
);

CREATE INDEX IF NOT EXISTS idx_forward_ledger_date
  ON forward_signal_ledger (trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_forward_ledger_action_date
  ON forward_signal_ledger (action, trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_forward_ledger_ticker_date
  ON forward_signal_ledger (ticker, trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_forward_ledger_universe_action
  ON forward_signal_ledger (universe_flag, action, trade_date DESC);

CREATE TABLE IF NOT EXISTS forward_signal_outcome (
  signal_id TEXT NOT NULL REFERENCES forward_signal_ledger (signal_id) ON DELETE RESTRICT,
  horizon TEXT NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trade_date DATE NOT NULL,
  exit_date DATE NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC NOT NULL,
  gross_return_pct NUMERIC NOT NULL,
  net_return_40_pct NUMERIC NOT NULL,
  net_return_60_pct NUMERIC NOT NULL,
  exit_reason TEXT NOT NULL,
  stop_hit BOOLEAN NOT NULL DEFAULT false,
  target_hit BOOLEAN NOT NULL DEFAULT false,
  first_hit TEXT NOT NULL DEFAULT 'NONE',
  baseline_return_pct NUMERIC,
  excess_return_40_pct NUMERIC,
  excess_return_60_pct NUMERIC,
  PRIMARY KEY (signal_id, horizon)
);

CREATE INDEX IF NOT EXISTS idx_forward_outcome_trade_date
  ON forward_signal_outcome (trade_date DESC, horizon);

CREATE INDEX IF NOT EXISTS idx_forward_outcome_horizon_exit
  ON forward_signal_outcome (horizon, exit_date DESC);

CREATE OR REPLACE FUNCTION prevent_forward_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Tabel % strictly append-only: UPDATE dan DELETE dilarang', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_forward_signal_ledger_no_mutation ON forward_signal_ledger;
CREATE TRIGGER trg_forward_signal_ledger_no_mutation
BEFORE UPDATE OR DELETE ON forward_signal_ledger
FOR EACH ROW EXECUTE FUNCTION prevent_forward_ledger_mutation();

DROP TRIGGER IF EXISTS trg_forward_signal_outcome_no_mutation ON forward_signal_outcome;
CREATE TRIGGER trg_forward_signal_outcome_no_mutation
BEFORE UPDATE OR DELETE ON forward_signal_outcome
FOR EACH ROW EXECUTE FUNCTION prevent_forward_ledger_mutation();

COMMENT ON TABLE forward_signal_ledger IS
  'Ledger append-only sinyal forward harian point-in-time untuk validasi OOS maju tanpa lookahead.';

COMMENT ON TABLE forward_signal_outcome IS
  'Outcome T+5 dan T+20 yang dihitung hanya setelah horizon lewat, tanpa mengubah tabel sinyal.';
