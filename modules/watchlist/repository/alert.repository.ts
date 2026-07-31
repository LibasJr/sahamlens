import crypto from 'crypto';
import { pool } from '../../../shared/database/postgres.client';
import type { Alert } from '../types/watchlist.types';

// condition_value NUMERIC - pg driver mengembalikan string, cast di satu titik.
function mapRow(row: any): Alert {
  return { ...row, condition_value: row.condition_value === null ? null : Number(row.condition_value) };
}

export async function listAlerts(userId: string): Promise<Alert[]> {
  const { rows } = await pool.query('SELECT * FROM alerts WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return rows.map(mapRow);
}

export async function countAlerts(userId: string): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM alerts WHERE user_id = $1 AND triggered = false', [userId]);
  return rows[0].count;
}

export async function createAlert(
  userId: string,
  input: { symbol: string; condition_type: string; condition_value: number | null }
): Promise<Alert> {
  const { rows } = await pool.query(
    `INSERT INTO alerts (id, user_id, symbol, condition_type, condition_value, triggered)
     VALUES ($1,$2,$3,$4,$5,false) RETURNING *`,
    [crypto.randomUUID(), userId, input.symbol, input.condition_type, input.condition_value]
  );
  return mapRow(rows[0]);
}

export async function deleteAlert(userId: string, id: string): Promise<void> {
  await pool.query('DELETE FROM alerts WHERE id = $1 AND user_id = $2', [id, userId]);
}

// Dipakai job evaluasi alert (bukan per-user, lintas semua user) - lihat
// shared/middleware & app/api/alerts/check yang masih dipertahankan sebagai
// endpoint terpisah karena scope-nya global, bukan satu user.
export async function listPendingAlerts(): Promise<Alert[]> {
  const { rows } = await pool.query('SELECT * FROM alerts WHERE triggered = false');
  return rows.map(mapRow);
}

export async function markTriggered(id: string): Promise<void> {
  await pool.query('UPDATE alerts SET triggered = true WHERE id = $1', [id]);
}
