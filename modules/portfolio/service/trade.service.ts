import crypto from 'crypto';
import { pool } from '../../../shared/database/postgres.client';
import { getPortfolioByUserIdForUpdate, updateCash } from '../repository/portfolio.repository';
import { getHoldingForUpdate, upsertHoldingAfterBuy, reduceHoldingAfterSell } from '../repository/holdings.repository';
import { insertTransaction } from '../repository/transaction.repository';
import { LOT_SIZE } from '../constants/portfolio.constants';
import { PortfolioNotFoundError, InsufficientCashError, InsufficientLotsError } from '../types/portfolio.errors';
import type { Transaction } from '../types/portfolio.types';
import type { TradeInput } from '../validator/trade.validator';

// Buy/sell WAJIB satu transaksi DB dengan row lock (FOR UPDATE) - ini yang menutup
// temuan C6 lama: dua request buy/sell bersamaan pada portfolio yang sama dulu bisa
// saling menimpa saldo cash karena baca-ubah-tulis file JSON tanpa lock sama sekali.
// Postgres yang menjamin urutan sekarang, bukan disiplin kode di level aplikasi.

export async function executeBuy(userId: string, input: TradeInput): Promise<Transaction> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const portfolio = await getPortfolioByUserIdForUpdate(userId, client);
    if (!portfolio) throw new PortfolioNotFoundError();

    const cost = input.price * input.lots * LOT_SIZE;
    if (Number(portfolio.cash) < cost) throw new InsufficientCashError();

    await updateCash(portfolio.id, Number(portfolio.cash) - cost, client);
    await upsertHoldingAfterBuy(portfolio.id, input.symbol, input.lots, input.price, client);

    const tx: Transaction = {
      id: crypto.randomUUID(),
      portfolio_id: portfolio.id,
      symbol: input.symbol,
      type: 'BUY',
      price: input.price,
      lots: input.lots,
      pnl: null,
      note: input.note || null,
      created_at: new Date().toISOString(),
    };
    await insertTransaction(tx, client);

    await client.query('COMMIT');
    return tx;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function executeSell(userId: string, input: TradeInput): Promise<Transaction> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const portfolio = await getPortfolioByUserIdForUpdate(userId, client);
    if (!portfolio) throw new PortfolioNotFoundError();

    const holding = await getHoldingForUpdate(portfolio.id, input.symbol, client);
    if (!holding || Number(holding.lots) < input.lots) throw new InsufficientLotsError();

    const gross = input.price * input.lots * LOT_SIZE;
    const costBasis = Number(holding.avg_price) * input.lots * LOT_SIZE;
    const pnl = gross - costBasis;

    await updateCash(portfolio.id, Number(portfolio.cash) + gross, client);
    await reduceHoldingAfterSell(portfolio.id, input.symbol, input.lots, client);

    const tx: Transaction = {
      id: crypto.randomUUID(),
      portfolio_id: portfolio.id,
      symbol: input.symbol,
      type: 'SELL',
      price: input.price,
      lots: input.lots,
      pnl,
      note: input.note || null,
      created_at: new Date().toISOString(),
    };
    await insertTransaction(tx, client);

    await client.query('COMMIT');
    return tx;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
