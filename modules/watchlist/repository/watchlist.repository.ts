import crypto from 'crypto';
import { pool } from '../../../shared/database/postgres.client';
import type { WatchlistItem } from '../types/watchlist.types';

// Kolom buy_price/alert_price NUMERIC - pg driver mengembalikannya sebagai string.
// Di-cast di sini (satu titik), bukan dibiarkan bocor ke controller/frontend -
// ditemukan lewat smoke test: `item.buy_price.toLocaleString()` pada string tidak
// memformat angka sama sekali, cuma mengembalikan string aslinya apa adanya.
function toNumberOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function mapRow(row: any): WatchlistItem {
  return { ...row, buy_price: toNumberOrNull(row.buy_price), alert_price: toNumberOrNull(row.alert_price) };
}

export async function listWatchlist(userId: string): Promise<WatchlistItem[]> {
  const { rows } = await pool.query('SELECT * FROM watchlists WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return rows.map(mapRow);
}

export async function countWatchlist(userId: string): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM watchlists WHERE user_id = $1', [userId]);
  return rows[0].count;
}

export async function upsertWatchlistItem(
  userId: string,
  input: { symbol: string; buy_price?: number | null; alert_price?: number | null; lot?: number | null }
): Promise<WatchlistItem> {
  const { rows } = await pool.query(
    `INSERT INTO watchlists (id, user_id, symbol, buy_price, alert_price, lot)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, symbol) DO UPDATE SET
       buy_price = EXCLUDED.buy_price, alert_price = EXCLUDED.alert_price, lot = EXCLUDED.lot
     RETURNING *`,
    [crypto.randomUUID(), userId, input.symbol, input.buy_price ?? null, input.alert_price ?? null, input.lot ?? null]
  );
  return mapRow(rows[0]);
}

export async function deleteWatchlistItem(userId: string, symbol: string): Promise<void> {
  await pool.query('DELETE FROM watchlists WHERE user_id = $1 AND symbol = $2', [userId, symbol]);
}

export interface PaginatedWatchlists {
  items: WatchlistItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

// Lintas-user (admin), bukan punya satu user - dipakai admin/export (API Guideline
// poin 5: jangan lagi dump semua baris tanpa batas). Cursor-based sama seperti
// modules/portfolio/repository/transaction.repository.ts.
export async function listAllWatchlistsPaginated(opts: { cursor?: string; limit?: number }): Promise<PaginatedWatchlists> {
  const limit = Math.min(opts.limit || 50, 200);
  const params: any[] = [];
  let where = '1=1';
  if (opts.cursor) {
    params.push(opts.cursor);
    where += ` AND created_at < $${params.length}`;
  }
  params.push(limit + 1);
  const { rows } = await pool.query(
    `SELECT * FROM watchlists WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const items = sliced.map(mapRow);
  const nextCursor = hasMore ? sliced[sliced.length - 1].created_at : null;
  return { items, nextCursor, hasMore };
}
