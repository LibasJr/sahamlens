import { pool } from '../../../shared/database/postgres.client';
import { assertDatabaseMigrated } from '../../../shared/database/migration-guard';

export type AdminAuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'CHANGE_SECRET'
  | 'SET_PRO'
  | 'CREATE_TEST_USER'
  | 'PAYMENT_RECONCILE';

export async function recordAdminAudit(input: {
  action: AdminAuditAction;
  target?: string | null;
  detail?: Record<string, unknown>;
  tokenJti?: string | null;
}): Promise<void> {
  await assertDatabaseMigrated();
  await pool.query(
    `INSERT INTO admin_audit_events (action, target, detail, token_jti)
     VALUES ($1, $2, $3::jsonb, $4)`,
    [input.action, input.target ?? null, JSON.stringify(input.detail ?? {}), input.tokenJti ?? null],
  );
}
