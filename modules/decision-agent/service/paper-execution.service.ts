import crypto from 'node:crypto';
import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { ConfigurePaperAccountInput } from '../validator/decision-agent.validator';
import type { DecisionAgentSignal, PaperOrder } from '../types/decision-agent.types';
import { calculatePaperBuyLots } from './paper-sizing';

const ACCOUNT_ID = 'internal-paper';
const LOT_SIZE = 100;

function asNumber(value: unknown): number {
  return Number(value);
}
function mapOrder(row: Record<string, unknown>): PaperOrder {
  return {
    id: String(row.id),
    signalId: String(row.signal_id),
    ticker: String(row.ticker),
    side: row.side as PaperOrder['side'],
    lots: asNumber(row.lots),
    limitPrice: asNumber(row.limit_price),
    status: row.status as PaperOrder['status'],
    rationale: String(row.rationale),
    proposedAt: new Date(String(row.proposed_at)).toISOString(),
    executedAt: row.executed_at ? new Date(String(row.executed_at)).toISOString() : null,
  };
}

export function assertHybridConfirmed(signal: DecisionAgentSignal): void {
  if (signal.hybridStatus !== 'CONFIRMED' || signal.hybridReview?.verdict !== 'CONFIRM') {
    throw new ConflictError('Paper order membutuhkan konfirmasi hybrid analyst yang valid');
  }
}

export async function configurePaperAccount(input: ConfigurePaperAccountInput): Promise<void> {
  await ensureSharedSchema();
  await pool.query(
    `INSERT INTO decision_agent_paper_accounts
      (id, name, cash, initial_cash, risk_budget_pct, max_position_pct, max_open_positions, enabled, updated_at)
     VALUES ($1, $2, $3, $3, $4, $5, $6, true, NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       cash = CASE
         WHEN NOT EXISTS (SELECT 1 FROM decision_agent_orders WHERE account_id = $1)
           THEN EXCLUDED.cash ELSE decision_agent_paper_accounts.cash END,
       initial_cash = CASE
         WHEN NOT EXISTS (SELECT 1 FROM decision_agent_orders WHERE account_id = $1)
           THEN EXCLUDED.initial_cash ELSE decision_agent_paper_accounts.initial_cash END,
       risk_budget_pct = EXCLUDED.risk_budget_pct,
       max_position_pct = EXCLUDED.max_position_pct,
       max_open_positions = EXCLUDED.max_open_positions,
       enabled = true,
       updated_at = NOW()`,
    [ACCOUNT_ID, 'Internal Decision Agent Paper Account', input.initialCash, input.riskBudgetPct, input.maxPositionPct, input.maxOpenPositions],
  );
}

export async function proposePaperOrder(signalId: string): Promise<PaperOrder> {
  await ensureSharedSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const signalResult = await client.query(`SELECT * FROM decision_agent_signals WHERE id = $1 FOR UPDATE`, [signalId]);
    const signalRow = signalResult.rows[0] as Record<string, unknown> | undefined;
    if (!signalRow) throw new NotFoundError('Sinyal tidak ditemukan');
    const signal = signalRow.payload as DecisionAgentSignal;
    if (signal.paperReadiness !== 'PAPER_READY') throw new ConflictError('Sinyal belum siap untuk paper order');
    assertHybridConfirmed(signal);

    const accountResult = await client.query(`SELECT * FROM decision_agent_paper_accounts WHERE id = $1 FOR UPDATE`, [ACCOUNT_ID]);
    const account = accountResult.rows[0] as Record<string, unknown> | undefined;
    if (!account || !account.enabled) throw new ConflictError('Paper account belum dikonfigurasi');

    const positionResult = await client.query(
      `SELECT * FROM decision_agent_paper_positions WHERE account_id = $1 AND ticker = $2 FOR UPDATE`,
      [ACCOUNT_ID, signal.ticker],
    );
    const position = positionResult.rows[0] as Record<string, unknown> | undefined;
    const existingLots = position ? asNumber(position.lots) : 0;
    const side = signal.action === 'BUY_CANDIDATE' ? 'BUY' : signal.action === 'EXIT_REVIEW' ? 'SELL' : null;
    if (!side) throw new ConflictError('Aksi sinyal tidak dapat menjadi paper order');

    let lots = existingLots;
    let rationale = 'Keluar penuh dari posisi paper setelah sinyal EXIT_REVIEW.';
    if (side === 'BUY') {
      if (!signal.riskSetup) throw new ConflictError('Setup risiko tidak tersedia');
      const positionCountResult = await client.query(
        `SELECT COUNT(*)::int AS count FROM decision_agent_paper_positions WHERE account_id = $1 AND lots > 0`,
        [ACCOUNT_ID],
      );
      const openPositions = asNumber(positionCountResult.rows[0]?.count);
      if (existingLots === 0 && openPositions >= asNumber(account.max_open_positions)) {
        throw new ConflictError('Batas jumlah posisi paper sudah tercapai');
      }
      const navResult = await client.query(
        `SELECT COALESCE(SUM(lots * 100 * last_price), 0) AS position_value
           FROM decision_agent_paper_positions WHERE account_id = $1 AND lots > 0`,
        [ACCOUNT_ID],
      );
      const cash = asNumber(account.cash);
      const nav = cash + asNumber(navResult.rows[0]?.position_value);
      const sizing = calculatePaperBuyLots({
        nav,
        cash,
        price: signal.price,
        stop: signal.riskSetup.stop,
        existingLots,
        riskBudgetPct: asNumber(account.risk_budget_pct),
        maxPositionPct: asNumber(account.max_position_pct),
      });
      lots = sizing.lots;
      if (lots <= 0) throw new ConflictError('Tidak ada ukuran lot yang lolos seluruh batas risiko');
      rationale = `Ukuran dibatasi oleh ${sizing.bindingConstraint}; memakai harga dan stop dari snapshot sinyal.`;
    } else if (lots <= 0) {
      throw new ConflictError('Tidak ada posisi paper yang dapat dijual');
    }

    const id = crypto.randomUUID();
    const idempotencyKey = `${signalId}:${side}`;
    const result = await client.query(
      `INSERT INTO decision_agent_orders
        (id, signal_id, account_id, ticker, side, lots, limit_price, status, rationale, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PROPOSED',$8,$9)
       ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
       RETURNING *`,
      [id, signalId, ACCOUNT_ID, signal.ticker, side, lots, signal.price, rationale, idempotencyKey],
    );
    await client.query('COMMIT');
    return mapOrder(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function executePaperOrder(orderId: string): Promise<PaperOrder> {
  await ensureSharedSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(`SELECT * FROM decision_agent_orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = orderResult.rows[0] as Record<string, unknown> | undefined;
    if (!order) throw new NotFoundError('Paper order tidak ditemukan');
    if (order.status !== 'PROPOSED') throw new ConflictError('Paper order bukan lagi berstatus PROPOSED');

    const accountResult = await client.query(`SELECT * FROM decision_agent_paper_accounts WHERE id = $1 FOR UPDATE`, [ACCOUNT_ID]);
    const account = accountResult.rows[0] as Record<string, unknown> | undefined;
    if (!account || !account.enabled) throw new ConflictError('Paper account tidak aktif');
    const ticker = String(order.ticker);
    const lots = asNumber(order.lots);
    const price = asNumber(order.limit_price);
    const value = lots * LOT_SIZE * price;
    const positionResult = await client.query(
      `SELECT * FROM decision_agent_paper_positions WHERE account_id = $1 AND ticker = $2 FOR UPDATE`,
      [ACCOUNT_ID, ticker],
    );
    const position = positionResult.rows[0] as Record<string, unknown> | undefined;

    if (order.side === 'BUY') {
      const cash = asNumber(account.cash);
      if (cash < value) throw new ConflictError('Kas paper tidak cukup pada saat konfirmasi');
      const oldLots = position ? asNumber(position.lots) : 0;
      const oldAverage = position ? asNumber(position.avg_price) : 0;
      const newLots = oldLots + lots;
      const newAverage = ((oldLots * oldAverage) + (lots * price)) / newLots;
      await client.query(`UPDATE decision_agent_paper_accounts SET cash = cash - $2, updated_at = NOW() WHERE id = $1`, [ACCOUNT_ID, value]);
      await client.query(
        `INSERT INTO decision_agent_paper_positions (account_id, ticker, lots, avg_price, last_price, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (account_id, ticker) DO UPDATE SET
           lots = EXCLUDED.lots, avg_price = EXCLUDED.avg_price,
           last_price = EXCLUDED.last_price, updated_at = NOW()`,
        [ACCOUNT_ID, ticker, newLots, newAverage, price],
      );
    } else if (order.side === 'SELL') {
      const ownedLots = position ? asNumber(position.lots) : 0;
      if (ownedLots < lots) throw new ConflictError('Lot paper tidak cukup pada saat konfirmasi');
      await client.query(`UPDATE decision_agent_paper_accounts SET cash = cash + $2, updated_at = NOW() WHERE id = $1`, [ACCOUNT_ID, value]);
      await client.query(
        `UPDATE decision_agent_paper_positions
            SET lots = lots - $3, last_price = $4, updated_at = NOW()
          WHERE account_id = $1 AND ticker = $2`,
        [ACCOUNT_ID, ticker, lots, price],
      );
    } else {
      throw new ValidationError('Sisi order tidak valid');
    }

    const updated = await client.query(
      `UPDATE decision_agent_orders SET status = 'EXECUTED', executed_at = NOW() WHERE id = $1 RETURNING *`,
      [orderId],
    );
    await client.query('COMMIT');
    return mapOrder(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectPaperOrder(orderId: string): Promise<PaperOrder> {
  await ensureSharedSchema();
  const { rows } = await pool.query(
    `UPDATE decision_agent_orders SET status = 'REJECTED'
      WHERE id = $1 AND status = 'PROPOSED' RETURNING *`,
    [orderId],
  );
  if (!rows[0]) throw new ConflictError('Paper order tidak ditemukan atau sudah diproses');
  return mapOrder(rows[0]);
}

export function executeLiveOrder(): never {
  throw new ConflictError('Live trading terkunci: model belum tervalidasi dan adapter broker belum dikonfigurasi');
}
