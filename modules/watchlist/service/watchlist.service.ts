import { pool } from '../../../shared/database/postgres.client';
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
//
// TOCTOU FIX (audit bug 2026-08-01): count+cek+insert sebelumnya tiga query terpisah
// tanpa lock - dua request "tambah watchlist" bersamaan pada user yang sama di batas
// limit bisa sama-sama lolos cek count sebelum salah satu insert commit, jadi user
// bisa berakhir 1 item lebih dari limit free-tier. pg_advisory_xact_lock mengunci
// per-user (hash dari userId) selama transaksi, menyerialkan panggilan addToWatchlist
// yang bersamaan untuk user yang sama - pola row-lock yang sama seperti buy/sell
// portofolio (modules/portfolio/service/trade.service.ts), tapi lewat advisory lock
// karena tidak ada baris tunggal yang bisa di-FOR UPDATE untuk sebuah COUNT(*).
export async function addToWatchlist(userId: string, hasPro: boolean, input: AddWatchlistInput): Promise<WatchlistItem> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);

    if (!hasPro) {
      const current = await countWatchlist(userId, client);
      const alreadyTracked = (await listWatchlist(userId, client)).some((w) => w.symbol === input.symbol);
      if (!alreadyTracked && current >= FREE_LIMITS.WATCHLIST) {
        throw new WatchlistLimitReachedError(FREE_LIMITS.WATCHLIST);
      }
    }
    const item = await upsertWatchlistItem(userId, input, client);

    await client.query('COMMIT');
    return item;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function removeFromWatchlist(userId: string, symbol: string): Promise<void> {
  await deleteWatchlistItem(userId, symbol);
}
