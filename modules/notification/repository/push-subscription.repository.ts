import crypto from 'crypto';
import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';

export interface StoredPushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface TriggeredAlertOwner {
  id: string;
  userId: string;
  symbol: string;
  conditionType: string;
}

type SubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type AlertOwnerRow = {
  id: string;
  user_id: string;
  symbol: string;
  condition_type: string;
};

function mapSubscription(row: SubscriptionRow): StoredPushSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
  };
}

export async function upsertPushSubscription(
  userId: string,
  input: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null },
): Promise<void> {
  await ensureSharedSchema();
  await pool.query(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent,
       updated_at = NOW(),
       failure_count = 0,
       disabled_at = NULL`,
    [crypto.randomUUID(), userId, input.endpoint, input.p256dh, input.auth, input.userAgent ?? null],
  );
}

export async function disablePushSubscription(userId: string, endpoint: string): Promise<void> {
  await ensureSharedSchema();
  await pool.query(
    `UPDATE push_subscriptions
     SET disabled_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND endpoint = $2`,
    [userId, endpoint],
  );
}

export async function disablePushSubscriptionById(subscriptionId: string): Promise<void> {
  await ensureSharedSchema();
  await pool.query(
    `UPDATE push_subscriptions
     SET disabled_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [subscriptionId],
  );
}

export async function listActivePushSubscriptions(userId: string): Promise<StoredPushSubscription[]> {
  await ensureSharedSchema();
  const { rows } = await pool.query<SubscriptionRow>(
    `SELECT id, user_id, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE user_id = $1 AND disabled_at IS NULL
     ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map(mapSubscription);
}

export async function getTriggeredAlertOwners(alertIds: readonly string[]): Promise<Map<string, TriggeredAlertOwner>> {
  if (alertIds.length === 0) return new Map();
  await ensureSharedSchema();
  const { rows } = await pool.query<AlertOwnerRow>(
    `SELECT id, user_id, symbol, condition_type
     FROM alerts
     WHERE id = ANY($1::text[])`,
    [alertIds],
  );
  return new Map(rows.map((row) => [row.id, {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    conditionType: row.condition_type,
  }]));
}

export async function reservePushDelivery(alertId: string, subscriptionId: string): Promise<boolean> {
  await ensureSharedSchema();
  const { rowCount } = await pool.query(
    `INSERT INTO push_delivery_log (alert_id, subscription_id, status)
     VALUES ($1, $2, 'PENDING')
     ON CONFLICT (alert_id, subscription_id) DO NOTHING`,
    [alertId, subscriptionId],
  );
  return rowCount === 1;
}

export async function markPushDelivery(
  alertId: string,
  subscriptionId: string,
  input: { status: 'SENT' | 'FAILED' | 'GONE'; statusCode?: number | null; error?: string | null },
): Promise<void> {
  await ensureSharedSchema();
  await pool.query(
    `UPDATE push_delivery_log
     SET status = $3,
         status_code = $4,
         error = $5,
         attempted_at = NOW(),
         sent_at = CASE WHEN $3 = 'SENT' THEN NOW() ELSE sent_at END
     WHERE alert_id = $1 AND subscription_id = $2`,
    [alertId, subscriptionId, input.status, input.statusCode ?? null, input.error?.slice(0, 500) ?? null],
  );

  if (input.status === 'SENT') {
    await pool.query(
      `UPDATE push_subscriptions
       SET last_success_at = NOW(), failure_count = 0, updated_at = NOW()
       WHERE id = $1`,
      [subscriptionId],
    );
  } else {
    await pool.query(
      `UPDATE push_subscriptions
       SET failure_count = failure_count + 1, updated_at = NOW()
       WHERE id = $1`,
      [subscriptionId],
    );
  }
}
