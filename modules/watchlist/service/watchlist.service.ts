import { listWatchlist, countWatchlist, upsertWatchlistItem, deleteWatchlistItem } from '../repository/watchlist.repository';
import { FREE_LIMITS } from '../constants/watchlist.constants';
import { WatchlistLimitReachedError } from '../types/watchlist.errors';
import type { WatchlistItem } from '../types/watchlist.types';
import type { AddWatchlistInput } from '../validator/watchlist.validator';

export async function getWatchlist(userId: string): Promise<WatchlistItem[]> {
  return listWatchlist(userId);
}

// Limit gratis sebelumnya HANYA dicek di klien (lib/limits.ts checkWatchlistLimit,
// bisa dilewati siapa pun yang memanggil API langsung) - sekarang ditegakkan di
// server juga. Ini perbaikan perilaku yang disengaja, bukan cuma pindah struktur.
export async function addToWatchlist(userId: string, hasPro: boolean, input: AddWatchlistInput): Promise<WatchlistItem> {
  if (!hasPro) {
    const current = await countWatchlist(userId);
    const alreadyTracked = (await listWatchlist(userId)).some((w) => w.symbol === input.symbol);
    if (!alreadyTracked && current >= FREE_LIMITS.WATCHLIST) {
      throw new WatchlistLimitReachedError(FREE_LIMITS.WATCHLIST);
    }
  }
  return upsertWatchlistItem(userId, input);
}

export async function removeFromWatchlist(userId: string, symbol: string): Promise<void> {
  await deleteWatchlistItem(userId, symbol);
}
