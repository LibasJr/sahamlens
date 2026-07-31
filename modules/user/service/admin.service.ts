import { cookies } from 'next/headers';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE } from '../../../shared/constants/cookie-names';
import { getStatsToday } from '../../../lib/serverStats';
import { supabaseAdmin } from '../../../lib/supabase';
import { listAllWatchlistsPaginated } from '../../watchlist';

/** Dipanggil di server (route handler / server component) - baca cookie HttpOnly. */
export function isAdminFromRequestCookies(cookieStore: { get(name: string): { value: string } | undefined }): boolean {
  return cookieStore.get(ADMIN_COOKIE)?.value === ADMIN_COOKIE_VALUE;
}

/** Shortcut untuk dipakai di Server Component / Route Handler App Router. */
export function isAdminServer(): boolean {
  try {
    return isAdminFromRequestCookies(cookies());
  } catch {
    return false;
  }
}

// TODO: getStatsToday tinggal di lib/serverStats.ts karena juga dipanggil dari
// app/api/stock/[ticker] (belum jadi bagian modules/technical). Pindah ke
// shared/observability saat module technical dimigrasi.
export function getAdminStatsToday() {
  return getStatsToday();
}

export interface AdminExportOptions {
  cursor?: string;
  limit?: number;
}

// watchlists sekarang dari Postgres asli (modules/watchlist), dipaginasi - API
// Guideline poin 5: admin/export dulu dump SEMUA baris sekaligus tanpa batas,
// risiko nyata response meledak begitu data bertambah.
//
// users/payments TETAP dari shim lib/supabase.ts (file lokal, lihat audit H2) -
// itu tabel "user" versi bot Telegram (telegram_id), sistem yang genuinely
// terpisah dari tabel `users` Postgres asli yang dipakai login web. Menyatukan
// keduanya itu keputusan produk besar, di luar cakupan migrasi ini - dibiarkan
// full-dump apa adanya sampai ada keputusan sadar soal itu.
export async function getAdminExportData(opts: AdminExportOptions = {}) {
  const [usersResult, watchlistsPage, paymentsResult] = await Promise.all([
    supabaseAdmin.from('users').select('*'),
    listAllWatchlistsPaginated(opts),
    supabaseAdmin.from('payments').select('*'),
  ]);

  return {
    users: usersResult.data || [],
    watchlists: watchlistsPage.items,
    watchlistsPagination: { nextCursor: watchlistsPage.nextCursor, hasMore: watchlistsPage.hasMore },
    payments: paymentsResult.data || [],
  };
}
