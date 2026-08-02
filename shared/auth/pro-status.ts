import { pool } from '../database/postgres.client';

// Query langsung ke tabel users lewat pool bersama (BUKAN lewat
// modules/user/repository/user.repository.ts) - modules/watchlist tidak boleh
// mengimpor apapun dari modules/user (circular dependency, lihat komentar di
// modules/watchlist/controller/{alert,watchlist}.controller.ts), dan
// shared/auth/session.ts sendiri tidak boleh mengimpor modules/user/index.ts
// (index.ts itu sendiri re-export dari shared/auth/session.ts, jadi impor
// balik akan circular). Query sengaja sesempit mungkin (3 kolom) - fungsi ini
// KHUSUS re-check status Pro yang mungkin basi di JWT, bukan pengganti
// getUserById() untuk kebutuhan lain.
export async function fetchLiveProFields(
  userId: string
): Promise<{ role: 'free' | 'pro' | 'admin'; is_pro: boolean; trial_ends_at: string | null } | null> {
  const { rows } = await pool.query('SELECT role, is_pro, trial_ends_at FROM users WHERE id = $1', [userId]);
  return rows[0] || null;
}
