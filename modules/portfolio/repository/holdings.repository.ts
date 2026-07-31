import type { PoolClient } from 'pg';
import { pool } from '../../../shared/database/postgres.client';
import type { Holding } from '../types/portfolio.types';

type Queryable = { query: (typeof pool)['query'] };

export async function getHoldings(portfolioId: string, db: Queryable = pool): Promise<Holding[]> {
  const { rows } = await db.query('SELECT * FROM holdings WHERE portfolio_id = $1 AND lots > 0 ORDER BY symbol', [portfolioId]);
  return rows;
}

export async function getHoldingForUpdate(portfolioId: string, symbol: string, client: PoolClient): Promise<Holding | null> {
  const { rows } = await client.query('SELECT * FROM holdings WHERE portfolio_id = $1 AND symbol = $2 FOR UPDATE', [portfolioId, symbol]);
  return rows[0] || null;
}

// Upsert dengan weighted-average cost basis dihitung di SQL - dipanggil di dalam
// transaksi yang sama dengan insert ke transactions & update cash (lihat
// service/trade.service.ts), bukan dihitung ulang dari replay seluruh histori
// setiap kali portofolio dibuka (perbaikan atas pola lama, lihat roadmap performa).
export async function upsertHoldingAfterBuy(
  portfolioId: string,
  symbol: string,
  addLots: number,
  buyPrice: number,
  client: PoolClient
): Promise<void> {
  await client.query(
    `INSERT INTO holdings (portfolio_id, symbol, lots, avg_price)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (portfolio_id, symbol) DO UPDATE SET
       avg_price = (holdings.avg_price * holdings.lots + EXCLUDED.avg_price * EXCLUDED.lots)
                   / (holdings.lots + EXCLUDED.lots),
       lots = holdings.lots + EXCLUDED.lots`,
    [portfolioId, symbol, addLots, buyPrice]
  );
}

export async function reduceHoldingAfterSell(portfolioId: string, symbol: string, removeLots: number, client: PoolClient): Promise<void> {
  await client.query('UPDATE holdings SET lots = lots - $3 WHERE portfolio_id = $1 AND symbol = $2', [portfolioId, symbol, removeLots]);
}
