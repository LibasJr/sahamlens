-- Append-only offline policy evaluation. This table cannot activate a policy or execute orders.
CREATE TABLE IF NOT EXISTS decision_agent_policy_learning_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('INSUFFICIENT_DATA','CHALLENGER_READY','BASELINE_RETAINED')),
  observation_count INTEGER NOT NULL CHECK (observation_count >= 0),
  baseline_policy JSONB NOT NULL,
  challenger_policy JSONB,
  train_metrics JSONB NOT NULL,
  validation_metrics JSONB NOT NULL,
  promotion_eligible BOOLEAN NOT NULL DEFAULT false,
  blockers JSONB NOT NULL,
  reward_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_decision_policy_learning_created
  ON decision_agent_policy_learning_runs(created_at DESC);
