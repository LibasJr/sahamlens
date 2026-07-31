import type { PoolClient } from 'pg';
import { pool } from '../../../shared/database/postgres.client';
import type { Portfolio } from '../types/portfolio.types';

// Queryable = pool biasa (baca di luar transaksi) ATAU PoolClient yang sedang
// dalam satu BEGIN/COMMIT (dipakai trade.service.ts untuk buy/sell atomik).
type Queryable = { query: (typeof pool)['query'] };

export async function getPortfolioByUserId(userId: string, db: Queryable = pool): Promise<Portfolio | null> {
  const { rows } = await db.query('SELECT * FROM portfolios WHERE user_id = $1', [userId]);
  return rows[0] || null;
}

export async function createPortfolio(portfolio: Portfolio, db: Queryable = pool): Promise<void> {
  await db.query(
    `INSERT INTO portfolios (id, user_id, name, cash, initial_cash, created_at)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id) DO NOTHING`,
    [portfolio.id, portfolio.user_id, portfolio.name, portfolio.cash, portfolio.initial_cash, portfolio.created_at]
  );
}

// Row lock (FOR UPDATE) - WAJIB dipanggil di dalam transaksi (client dari
// pool.connect(), bukan pool langsung) supaya dua buy/sell bersamaan pada
// portfolio yang sama tidak saling menimpa saldo cash (temuan C6 lama).
export async function getPortfolioByUserIdForUpdate(userId: string, client: PoolClient): Promise<Portfolio | null> {
  const { rows } = await client.query('SELECT * FROM portfolios WHERE user_id = $1 FOR UPDATE', [userId]);
  return rows[0] || null;
}

export async function updateCash(portfolioId: string, newCash: number, client: PoolClient): Promise<void> {
  await client.query('UPDATE portfolios SET cash = $1 WHERE id = $2', [newCash, portfolioId]);
}
