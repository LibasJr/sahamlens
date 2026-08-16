import { pool } from '../database/postgres.client';
import { readAdminToken } from './admin-token';

/**
 * Live admin verification used by Node/server routes. A secret change increments
 * admin_secret.session_version, immediately invalidating old cookies even if their JWT
 * signature/expiry is otherwise valid. Version 0 is reserved for explicitly enabled
 * break-glass sessions when the database credential path is unavailable.
 */
export async function verifyAdminTokenLive(value: string | undefined | null): Promise<boolean> {
  const payload = await readAdminToken(value);
  if (!payload) return false;
  if (payload.ver === 0) return process.env.ADMIN_BREAK_GLASS_ENABLED === 'true';
  try {
    const { rows } = await pool.query<{ session_version: number }>(
      'SELECT session_version FROM admin_secret WHERE id = 1',
    );
    return Number(rows[0]?.session_version) === payload.ver;
  } catch {
    // Authorization is fail-closed. Break-glass is represented by an explicit v0 token.
    return false;
  }
}
