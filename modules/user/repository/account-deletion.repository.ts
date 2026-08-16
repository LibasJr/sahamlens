import { pool } from '@/shared/database/postgres.client';

/**
 * Delete user-controlled product data atomically. Accounting rows are retained but
 * de-identified so financial reconciliation survives without keeping account PII.
 */
export async function deleteUserAccountData(userId: string, email: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: portfolios } = await client.query<{id:string}>('SELECT id FROM portfolios WHERE user_id=$1', [userId]);
    const portfolioIds = portfolios.map((r: { id: string }) => r.id);
    if (portfolioIds.length) {
      await client.query('DELETE FROM transactions WHERE portfolio_id = ANY($1::text[])', [portfolioIds]);
      await client.query('DELETE FROM holdings WHERE portfolio_id = ANY($1::text[])', [portfolioIds]);
    }
    await client.query('DELETE FROM portfolios WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM alerts WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM watchlists WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM lensai_feedback WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM user_auth_events WHERE user_id=$1 OR lower(email)=lower($2)', [userId, email]);
    // Keep payment state for bookkeeping/reconciliation, remove account identity.
    await client.query(`UPDATE payment_orders SET user_id=NULL,email=NULL,updated_at=now() WHERE user_id=$1 OR lower(COALESCE(email,''))=lower($2)`, [userId, email]);
    await client.query('DELETE FROM users WHERE id=$1', [userId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
