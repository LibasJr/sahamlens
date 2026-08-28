-- Web Push subscriptions for LensAlert mobile/desktop notifications.
-- Endpoints and browser encryption keys are device capabilities, not analytics identifiers.
-- They are retained only while the user keeps the device subscribed.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_success_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  disabled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_active
  ON push_subscriptions (user_id, updated_at DESC)
  WHERE disabled_at IS NULL;

-- One alert is delivered at most once to one browser subscription. The unique primary
-- key is the deduplication boundary if a scheduler/manual check overlaps.
CREATE TABLE IF NOT EXISTS push_delivery_log (
  alert_id TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'GONE')),
  status_code INTEGER,
  error TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  PRIMARY KEY (alert_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_push_delivery_log_attempted
  ON push_delivery_log (attempted_at DESC);
