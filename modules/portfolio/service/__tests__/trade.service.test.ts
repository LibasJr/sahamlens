import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = { query: vi.fn(), release: vi.fn() };
const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  getPortfolio: vi.fn(), updateCash: vi.fn(),
  getHolding: vi.fn(), upsertHolding: vi.fn(), reduceHolding: vi.fn(), insertTransaction: vi.fn(),
}));

vi.mock('../../../../shared/database/postgres.client', () => ({ pool: { connect: mocks.connect } }));
vi.mock('../../repository/portfolio.repository', () => ({
  getPortfolioByUserIdForUpdate: mocks.getPortfolio,
  updateCash: mocks.updateCash,
}));
vi.mock('../../repository/holdings.repository', () => ({
  getHoldingForUpdate: mocks.getHolding,
  upsertHoldingAfterBuy: mocks.upsertHolding,
  reduceHoldingAfterSell: mocks.reduceHolding,
}));
vi.mock('../../repository/transaction.repository', () => ({ insertTransaction: mocks.insertTransaction }));

import { executeBuy, executeSell } from '../trade.service';
import { InsufficientCashError, InsufficientLotsError } from '../../types/portfolio.errors';

const portfolio = { id: 'p1', user_id: 'u1', name: 'Utama', cash: 10_000_000, initial_cash: 10_000_000, created_at: '2026-01-01' };
const input = { symbol: 'BBCA.JK', lots: 2, price: 10_000, note: '' };

describe('portfolio trade money path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.query.mockResolvedValue({ rows: [] });
    mocks.connect.mockResolvedValue(client);
    mocks.getPortfolio.mockResolvedValue(portfolio);
    mocks.updateCash.mockResolvedValue(undefined);
    mocks.upsertHolding.mockResolvedValue(undefined);
    mocks.reduceHolding.mockResolvedValue(undefined);
    mocks.insertTransaction.mockResolvedValue(undefined);
  });

  it('BUY mengurangi cash, menambah holding, mencatat transaksi dan commit atomik', async () => {
    const tx = await executeBuy('u1', input);
    expect(mocks.updateCash).toHaveBeenCalledWith('p1', 8_000_000, client);
    expect(mocks.upsertHolding).toHaveBeenCalledWith('p1', 'BBCA.JK', 2, 10_000, client);
    expect(mocks.insertTransaction).toHaveBeenCalledOnce();
    expect(tx.type).toBe('BUY');
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.query).not.toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('BUY dengan cash kurang rollback dan tidak mengubah holding/transaksi', async () => {
    mocks.getPortfolio.mockResolvedValue({ ...portfolio, cash: 1_000_000 });
    await expect(executeBuy('u1', input)).rejects.toBeInstanceOf(InsufficientCashError);
    expect(mocks.updateCash).not.toHaveBeenCalled();
    expect(mocks.upsertHolding).not.toHaveBeenCalled();
    expect(mocks.insertTransaction).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('SELL parsial menambah cash dan menghitung realized PnL dari average cost', async () => {
    mocks.getHolding.mockResolvedValue({ portfolio_id: 'p1', symbol: 'BBCA.JK', lots: 5, avg_price: 8_000 });
    const tx = await executeSell('u1', { ...input, price: 10_000, lots: 2 });
    expect(mocks.updateCash).toHaveBeenCalledWith('p1', 12_000_000, client);
    expect(mocks.reduceHolding).toHaveBeenCalledWith('p1', 'BBCA.JK', 2, client);
    expect(tx.pnl).toBe(400_000);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('SELL melebihi posisi rollback tanpa mutation', async () => {
    mocks.getHolding.mockResolvedValue({ portfolio_id: 'p1', symbol: 'BBCA.JK', lots: 1, avg_price: 8_000 });
    await expect(executeSell('u1', { ...input, lots: 2 })).rejects.toBeInstanceOf(InsufficientLotsError);
    expect(mocks.updateCash).not.toHaveBeenCalled();
    expect(mocks.reduceHolding).not.toHaveBeenCalled();
    expect(mocks.insertTransaction).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
