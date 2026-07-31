import type { PoolClient } from 'pg';
import { pool } from '../../../shared/database/postgres.client';
import { ensureSharedSchema } from '../../../shared/database/schema.service';
import { TRANSACTIONS_DEFAULT_PAGE_SIZE, TRANSACTIONS_MAX_PAGE_SIZE } from '../constants/portfolio.constants';
import type { Transaction } from '../types/portfolio.types';

type Queryable = { query: (typeof pool)['query'] };

export async function insertTransaction(tx: Transaction, client: PoolClient): Promise<void> {
  await ensureSharedSchema();
  await client.query(
    `INSERT INTO transactions (id, portfolio_id, symbol, type, price, lots, pnl, note, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [tx.id, tx.portfolio_id, tx.symbol, tx.type, tx.price, tx.lots, tx.pnl, tx.note, tx.created_at]
  );
}

export interface PaginatedTransactions {
  items: Transaction[];
  nextCursor: string | null;
  hasMore: boolean;
}

// Cursor-based (API Guideline poin 6) - cursor = created_at ISO string item
// terakhir di halaman sebelumnya, bukan offset (offset mahal & tidak stabil kalau
// ada insert baru di antara dua request halaman berurutan).
export async function listTransactions(
  portfolioId: string,
  opts: { cursor?: string; limit?: number },
  db: Queryable = pool
): Promise<PaginatedTransactions> {
  await ensureSharedSchema();
  const limit = Math.min(opts.limit || TRANSACTIONS_DEFAULT_PAGE_SIZE, TRANSACTIONS_MAX_PAGE_SIZE);
  const params: any[] = [portfolioId];
  let where = 'portfolio_id = $1';
  if (opts.cursor) {
    params.push(opts.cursor);
    where += ` AND created_at < $${params.length}`;
  }
  params.push(limit + 1);
  const { rows } = await db.query(
    `SELECT * FROM transactions WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  // pg driver mengembalikan kolom NUMERIC sebagai string (mencegah presisi hilang
  // untuk angka besar) - WAJIB di-cast eksplisit di sini, kalau tidak konsumen
  // (frontend maupun kode backend lain) diam-diam menerima string, bukan number,
  // dan operasi seperti `cash + x` jadi concatenation string, bukan penjumlahan.
  const items: Transaction[] = sliced.map((r: any) => ({
    ...r,
    price: Number(r.price),
    lots: Number(r.lots),
    pnl: r.pnl === null ? null : Number(r.pnl),
  }));
  const nextCursor = hasMore ? sliced[sliced.length - 1].created_at : null;
  return { items, nextCursor, hasMore };
}
