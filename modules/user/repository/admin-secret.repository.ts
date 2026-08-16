import { pool } from '../../../shared/database/postgres.client';
import { assertDatabaseMigrated } from '../../../shared/database/migration-guard';

export interface AdminSecretState {
  secretHash: string | null;
  sessionVersion: number;
}

function ensureSchema(): Promise<void> {
  return assertDatabaseMigrated();
}

export async function getAdminSecretState(): Promise<AdminSecretState> {
  await ensureSchema();
  const { rows } = await pool.query<{ secret_hash: string; session_version: number }>(
    'SELECT secret_hash, session_version FROM admin_secret WHERE id = 1',
  );
  const row = rows[0];
  return row
    ? { secretHash: row.secret_hash, sessionVersion: Number(row.session_version) || 1 }
    : { secretHash: null, sessionVersion: 1 };
}

export async function getAdminSecretHash(): Promise<string | null> {
  return (await getAdminSecretState()).secretHash;
}

export async function getAdminSessionVersion(): Promise<number> {
  return (await getAdminSecretState()).sessionVersion;
}

/**
 * Persist a new bcrypt hash and atomically invalidate every existing admin session.
 * Returns the new session version so the caller can issue a replacement cookie.
 */
export async function setAdminSecretHash(hash: string): Promise<number> {
  await ensureSchema();
  const { rows } = await pool.query<{ session_version: number }>(
    `INSERT INTO admin_secret (id, secret_hash, session_version, updated_at)
     VALUES (1, $1, 1, now())
     ON CONFLICT (id) DO UPDATE SET
       secret_hash = EXCLUDED.secret_hash,
       session_version = admin_secret.session_version + 1,
       updated_at = now()
     RETURNING session_version`,
    [hash],
  );
  return Number(rows[0]?.session_version) || 1;
}
