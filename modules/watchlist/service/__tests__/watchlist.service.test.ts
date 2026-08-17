import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = { query: vi.fn(), release: vi.fn() };
const mocks = vi.hoisted(() => ({
  connect: vi.fn(), list: vi.fn(), count: vi.fn(), upsert: vi.fn(), remove: vi.fn(),
}));
vi.mock('../../../../shared/database/postgres.client', () => ({ pool: { connect: mocks.connect } }));
vi.mock('../../repository/watchlist.repository', () => ({
  listWatchlist: mocks.list,
  countWatchlist: mocks.count,
  upsertWatchlistItem: mocks.upsert,
  deleteWatchlistItem: mocks.remove,
}));

import { addToWatchlist, removeFromWatchlist } from '../watchlist.service';
import { WatchlistLimitReachedError } from '../../types/watchlist.errors';

const item = { id: 'w1', user_id: 'u1', symbol: 'BBCA.JK', buy_price: null, alert_price: null, lot: null, created_at: '2026-01-01' };

describe('watchlist server enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.query.mockResolvedValue({ rows: [] });
    mocks.connect.mockResolvedValue(client);
    mocks.count.mockResolvedValue(0);
    mocks.list.mockResolvedValue([]);
    mocks.upsert.mockResolvedValue(item);
    mocks.remove.mockResolvedValue(undefined);
  });

  it('free user tidak bisa menambah simbol baru saat limit tercapai', async () => {
    mocks.count.mockResolvedValue(3);
    mocks.list.mockResolvedValue([{ ...item, symbol: 'BBRI.JK' }, { ...item, symbol: 'BMRI.JK' }, { ...item, symbol: 'TLKM.JK' }]);
    await expect(addToWatchlist('u1', false, { symbol: 'BBCA.JK' })).rejects.toBeInstanceOf(WatchlistLimitReachedError);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('existing symbol boleh diperbarui walau free user sudah di batas', async () => {
    mocks.count.mockResolvedValue(3);
    mocks.list.mockResolvedValue([{ ...item, symbol: 'BBCA.JK' }, { ...item, symbol: 'BMRI.JK' }, { ...item, symbol: 'TLKM.JK' }]);
    await expect(addToWatchlist('u1', false, { symbol: 'BBCA.JK', buy_price: 9000 })).resolves.toEqual(item);
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('Pro melewati limit free tetapi tetap memakai transaksi/lock yang sama', async () => {
    mocks.count.mockResolvedValue(999);
    await addToWatchlist('u1', true, { symbol: 'BBCA.JK' });
    expect(mocks.count).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', ['u1']);
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it('free user bisa menambah simbol saat jumlah watchlist masih di bawah limit', async () => {
    mocks.count.mockResolvedValue(1);
    mocks.list.mockResolvedValue([{ ...item, symbol: 'BBRI.JK' }]);
    await expect(addToWatchlist('u1', false, { symbol: 'BBCA.JK' })).resolves.toEqual(item);
    expect(mocks.upsert).toHaveBeenCalledWith('u1', { symbol: 'BBCA.JK' }, client);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('error database saat upsert watchlist memicu rollback dan release client', async () => {
    mocks.upsert.mockRejectedValue(new Error('Watchlist write failed'));
    await expect(addToWatchlist('u1', true, { symbol: 'BBCA.JK' })).rejects.toThrow('Watchlist write failed');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
