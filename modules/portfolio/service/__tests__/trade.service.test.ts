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
import { InsufficientCashError, InsufficientLotsError, PortfolioNotFoundError } from '../../types/portfolio.errors';

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

  it('BUY dengan cash pas (sisa 0) berhasil tanpa error', async () => {
    // Biaya beli 2 lot @ Rp 10.000 = Rp 2.000.000 (2 lot * 100 lembar * Rp 10.000)
    mocks.getPortfolio.mockResolvedValue({ ...portfolio, cash: 2_000_000 });
    const tx = await executeBuy('u1', input);
    expect(mocks.updateCash).toHaveBeenCalledWith('p1', 0, client);
    expect(tx.type).toBe('BUY');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('BUY dengan cash kurang rollback dan tidak mengubah holding/transaksi', async () => {
    mocks.getPortfolio.mockResolvedValue({ ...portfolio, cash: 1_000_000 });
    await expect(executeBuy('u1', input)).rejects.toBeInstanceOf(InsufficientCashError);
    expect(mocks.updateCash).not.toHaveBeenCalled();
    expect(mocks.upsertHolding).not.toHaveBeenCalled();
    expect(mocks.insertTransaction).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('BUY ketika portfolio tidak ditemukan melempar PortfolioNotFoundError dan rollback', async () => {
    mocks.getPortfolio.mockResolvedValue(null);
    await expect(executeBuy('u1', input)).rejects.toBeInstanceOf(PortfolioNotFoundError);
    expect(mocks.updateCash).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('SELL parsial menambah cash dan menghitung realized PnL positif dari average cost', async () => {
    mocks.getHolding.mockResolvedValue({ portfolio_id: 'p1', symbol: 'BBCA.JK', lots: 5, avg_price: 8_000 });
    const tx = await executeSell('u1', { ...input, price: 10_000, lots: 2 });
    expect(mocks.updateCash).toHaveBeenCalledWith('p1', 12_000_000, client);
    expect(mocks.reduceHolding).toHaveBeenCalledWith('p1', 'BBCA.JK', 2, client);
    expect(tx.pnl).toBe(400_000);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('SELL rugi (harga jual di bawah avg price) menghitung realized PnL negatif', async () => {
    mocks.getHolding.mockResolvedValue({ portfolio_id: 'p1', symbol: 'BBCA.JK', lots: 5, avg_price: 10_000 });
    const tx = await executeSell('u1', { ...input, price: 8_000, lots: 2 });
    // Jual 2 lot @ 8.000 = +1.600.000 cash. PnL = (8000 - 10000) * 2 * 100 = -400.000
    expect(mocks.updateCash).toHaveBeenCalledWith('p1', 11_600_000, client);
    expect(tx.pnl).toBe(-400_000);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('SELL impas (harga jual sama dengan avg price) menghasilkan PnL nol', async () => {
    mocks.getHolding.mockResolvedValue({ portfolio_id: 'p1', symbol: 'BBCA.JK', lots: 5, avg_price: 10_000 });
    const tx = await executeSell('u1', { ...input, price: 10_000, lots: 2 });
    expect(tx.pnl).toBe(0);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('SELL melebihi posisi holding melempar InsufficientLotsError dan rollback tanpa mutation', async () => {
    mocks.getHolding.mockResolvedValue({ portfolio_id: 'p1', symbol: 'BBCA.JK', lots: 1, avg_price: 8_000 });
    await expect(executeSell('u1', { ...input, lots: 2 })).rejects.toBeInstanceOf(InsufficientLotsError);
    expect(mocks.updateCash).not.toHaveBeenCalled();
    expect(mocks.reduceHolding).not.toHaveBeenCalled();
    expect(mocks.insertTransaction).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('SELL ketika saham sama sekali belum dimiliki (holding null) melempar InsufficientLotsError', async () => {
    mocks.getHolding.mockResolvedValue(null);
    await expect(executeSell('u1', { ...input, lots: 2 })).rejects.toBeInstanceOf(InsufficientLotsError);
    expect(mocks.updateCash).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('SELL ketika portfolio tidak ditemukan melempar PortfolioNotFoundError dan rollback', async () => {
    mocks.getPortfolio.mockResolvedValue(null);
    await expect(executeSell('u1', input)).rejects.toBeInstanceOf(PortfolioNotFoundError);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('Error database saat insert transaction memicu rollback dan release client', async () => {
    mocks.insertTransaction.mockRejectedValue(new Error('DB write failed'));
    await expect(executeBuy('u1', input)).rejects.toThrow('DB write failed');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
