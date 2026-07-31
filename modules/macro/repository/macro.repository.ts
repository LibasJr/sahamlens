import { pool } from '../../../shared/database/postgres.client';

export async function insertIndicator(indicator: string, value: number, source: string): Promise<void> {
  await pool.query('INSERT INTO macro_indicators (indicator, value, source) VALUES ($1, $2, $3)', [indicator, value, source]);
}

export async function getLatestIndicator(indicator: string): Promise<{ value: number; recorded_at: string } | null> {
  const { rows } = await pool.query(
    'SELECT value, recorded_at FROM macro_indicators WHERE indicator = $1 ORDER BY recorded_at DESC LIMIT 1',
    [indicator]
  );
  if (!rows[0]) return null;
  return { value: Number(rows[0].value), recorded_at: rows[0].recorded_at };
}
