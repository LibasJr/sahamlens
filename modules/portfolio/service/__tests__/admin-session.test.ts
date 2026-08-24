import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPortfolioByUserId: vi.fn(),
  createPortfolio: vi.fn(),
  getHoldings: vi.fn(),
  listTransactions: vi.fn(),
  verifyTradePrice: vi.fn(),
  executeBuy: vi.fn(),
  executeSell: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock('../../repository/portfolio.repository', () => ({
  getPortfolioByUserId: mocks.getPortfolioByUserId,
  createPortfolio: mocks.createPortfolio,
}));
vi.mock('../../repository/holdings.repository', () => ({ getHoldings: mocks.getHoldings }));
vi.mock('../../repository/transaction.repository', () => ({ listTransactions: mocks.listTransactions }));
vi.mock('../../service/trade.service', () => ({ executeBuy: mocks.executeBuy, executeSell: mocks.executeSell }));
vi.mock('../../service/price-guard.service', () => ({ verifyTradePrice: mocks.verifyTradePrice }));
vi.mock('../../../../shared/middleware/require-auth', () => ({ requireUser: mocks.requireUser }));

import { getPortfolioSummary, getTransactionHistory, provisionPortfolio } from '../portfolio.service';
import { handleBuy, handleSell, handleGetPortfolio } from '../../controller/portfolio.controller';
import { SYNTHETIC_ADMIN_SESSION_ID } from '../../../../shared/constants/identity';
import { INITIAL_CASH } from '../../constants/portfolio.constants';

// Regresi insiden 2026-08-24: login lewat admin secret memakai id sesi sintetis yang
// tidak punya baris `users`. Halaman Akun Demo memicu auto-provisioning portfolio
// untuk id itu, insert-nya melanggar portfolios_user_id_fkey, dan API membalas 500 -
// pengguna melihat halaman gagal memuat, bukan portofolio.
describe('sesi admin-secret tidak menyentuh tabel ber-FK ke users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPortfolioByUserId.mockResolvedValue(null);
    mocks.requireUser.mockResolvedValue({ id: SYNTHETIC_ADMIN_SESSION_ID, email: 'admin@sahamlens.local', role: 'admin' });
    mocks.verifyTradePrice.mockResolvedValue({ ok: true });
  });

  it('getPortfolioSummary mengembalikan ringkasan kosong tanpa insert portfolio', async () => {
    const summary = await getPortfolioSummary(SYNTHETIC_ADMIN_SESSION_ID);

    expect(mocks.createPortfolio).not.toHaveBeenCalled();
    expect(mocks.getPortfolioByUserId).not.toHaveBeenCalled();
    expect(summary.portfolio.cash).toBe(INITIAL_CASH);
    expect(summary.holdings).toEqual([]);
    expect(summary.transactions).toEqual([]);
  });

  it('GET /api/portfolio balas 200, bukan 500 dari pelanggaran foreign key', async () => {
    const result = await handleGetPortfolio();
    expect(result.status).toBe(200);
  });

  it('provisionPortfolio dilewati untuk id sintetis', async () => {
    await provisionPortfolio(SYNTHETIC_ADMIN_SESSION_ID);
    expect(mocks.createPortfolio).not.toHaveBeenCalled();
  });

  it('getTransactionHistory kosong tanpa query portfolio', async () => {
    const history = await getTransactionHistory(SYNTHETIC_ADMIN_SESSION_ID, { limit: 10 });
    expect(history).toEqual({ items: [], nextCursor: null, hasMore: false });
    expect(mocks.listTransactions).not.toHaveBeenCalled();
  });

  it('BUY/SELL ditolak 403 dengan pesan yang bisa ditindaklanjuti, tanpa menulis transaksi', async () => {
    const body = { symbol: 'BBCA.JK', lots: 1, price: 8_000, note: '' };

    await expect(handleBuy(body)).rejects.toMatchObject({ status: 403 });
    await expect(handleSell(body)).rejects.toMatchObject({ status: 403 });
    expect(mocks.executeBuy).not.toHaveBeenCalled();
    expect(mocks.executeSell).not.toHaveBeenCalled();
  });
});

describe('akun biasa tidak ikut terpengaruh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: 'u1', email: 'u@example.com', role: 'free' });
    mocks.verifyTradePrice.mockResolvedValue({ ok: true });
    mocks.getPortfolioByUserId.mockResolvedValue({
      id: 'pf_u1', user_id: 'u1', name: 'Portfolio Virtual',
      cash: INITIAL_CASH, initial_cash: INITIAL_CASH, created_at: '2026-01-01',
    });
    mocks.getHoldings.mockResolvedValue([{ portfolio_id: 'pf_u1', symbol: 'BBCA.JK', lots: 2, avg_price: 8_000 }]);
    mocks.listTransactions.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mocks.executeBuy.mockResolvedValue({ id: 't1', type: 'BUY' });
  });

  it('ringkasan tetap dibaca dari database', async () => {
    const summary = await getPortfolioSummary('u1');
    expect(mocks.getPortfolioByUserId).toHaveBeenCalledWith('u1');
    expect(summary.holdings).toHaveLength(1);
  });

  it('BUY tetap diteruskan ke trade service', async () => {
    const result = await handleBuy({ symbol: 'BBCA.JK', lots: 1, price: 8_000, note: '' });
    expect(result.status).toBe(200);
    expect(mocks.executeBuy).toHaveBeenCalledOnce();
  });
});
