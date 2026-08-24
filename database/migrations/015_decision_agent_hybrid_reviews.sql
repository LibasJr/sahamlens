-- Append-only, schema-validated LLM second opinions for Decision Agent signals.
-- Raw model text is intentionally not stored: only validated enums and evidence IDs.

ALTER TABLE decision_agent_runs
  ADD COLUMN IF NOT EXISTS hybrid_status TEXT,
  ADD COLUMN IF NOT EXISTS hybrid_model TEXT,
  ADD COLUMN IF NOT EXISTS hybrid_reviewed_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hybrid_input_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS hybrid_output_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS hybrid_error_code TEXT;

CREATE TABLE IF NOT EXISTS decision_agent_hybrid_reviews (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL UNIQUE REFERENCES decision_agent_signals(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK (verdict IN ('CONFIRM', 'CHALLENGE', 'INSUFFICIENT_EVIDENCE')),
  confidence TEXT NOT NULL CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH')),
  evidence_refs JSONB NOT NULL,
  concerns JSONB NOT NULL,
  next_evidence JSONB NOT NULL,
  model TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decision_agent_hybrid_verdict_reviewed
  ON decision_agent_hybrid_reviews (verdict, reviewed_at DESC);
