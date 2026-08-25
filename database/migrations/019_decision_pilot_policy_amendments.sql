-- Append-only audit trail for explicit user-authorized changes to a frozen pilot.
-- The protocol remains frozen: amendments are exceptional, attributable events rather
-- than silent edits. This migration does not change any policy value by itself.

CREATE TABLE IF NOT EXISTS decision_agent_pilot_policy_amendments (
  id TEXT PRIMARY KEY,
  protocol_id TEXT NOT NULL REFERENCES decision_agent_pilot_protocols(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  previous_value JSONB NOT NULL,
  new_value JSONB NOT NULL,
  reason TEXT NOT NULL,
  authorized_by TEXT NOT NULL CHECK (authorized_by = 'USER_DIRECTIVE'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_pilot_amendments_created
  ON decision_agent_pilot_policy_amendments(protocol_id, created_at DESC);
