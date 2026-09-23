import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(), count: vi.fn(), upsert: vi.fn(), remove: vi.fn(), updateJournal: vi.fn(),
}));
vi.mock('../../../../shared/database/postgres.client', () => ({ pool: { connect: vi.fn() } }));
vi.mock('../../repository/watchlist.repository', () => ({
  listWatchlist: mocks.list,
  countWatchlist: mocks.count,
  upsertWatchlistItem: mocks.upsert,
  deleteWatchlistItem: mocks.remove,
  updateWatchlistJournal: mocks.updateJournal,
}));

import { updateJournal } from '../watchlist.service';
import type { WatchlistItem } from '../../types/watchlist.types';

describe('updateJournal', () => {
  const mockItem: WatchlistItem = {
    id: 'w1', user_id: 'u1', symbol: 'BBCA.JK', buy_price: 9000,
    alert_price: null, lot: null, journal_note: 'Beli bertahap di support 8500',
    created_at: '2026-01-01', updated_at: '2026-09-23',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('memperbarui journal note dengan input valid', async () => {
    mocks.updateJournal.mockResolvedValue(mockItem);
    const result = await updateJournal('u1', 'BBCA.JK', { symbol: 'BBCA.JK', journal_note: 'Beli bertahap di support 8500' });
    expect(result.journal_note).toBe('Beli bertahap di support 8500');
    expect(mocks.updateJournal).toHaveBeenCalledWith('u1', 'BBCA.JK', 'Beli bertahap di support 8500');
  });

  it('menghapus catatan melalui string kosong tanpa menghapus watchlist item', async () => {
    mocks.updateJournal.mockResolvedValue({ ...mockItem, journal_note: null });
    const result = await updateJournal('u1', 'BBCA.JK', { symbol: 'BBCA.JK', journal_note: '' });
    expect(result.journal_note).toBeNull();
    expect(mocks.updateJournal).toHaveBeenCalledWith('u1', 'BBCA.JK', '');
  });

  it('meneruskan error dari repository ketika watchlist item tidak ditemukan', async () => {
    mocks.updateJournal.mockRejectedValue(new Error('Item watchlist tidak ditemukan'));
    await expect(updateJournal('u1', 'UNKNOWN.JK', { symbol: 'UNKNOWN.JK', journal_note: 'test' })).rejects.toThrow('Item watchlist tidak ditemukan');
  });
});
