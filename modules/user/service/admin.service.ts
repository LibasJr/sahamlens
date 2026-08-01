import { cookies } from 'next/headers';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE } from '../../../shared/constants/cookie-names';
import { getStatsToday } from '../../../lib/serverStats';
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

// watchlists dari Postgres asli (modules/watchlist), dipaginasi - API Guideline
// poin 5: admin/export dulu dump SEMUA baris sekaligus tanpa batas, risiko nyata
// response meledak begitu data bertambah.
//
// users/payments dulu dari shim lib/supabase.ts (file lokal, bukan Supabase asli -
// datanya hilang tiap cold start di Vercel) - itu tabel "user" versi bot Telegram
// (telegram_id). Bot/login Telegram sudah tidak dipakai (dihapus bersama
// modules/user/service/telegram-auth.service.ts), jadi field ini sekarang selalu
// kosong alih-alih membaca data yang tidak pernah nyata/persisten. Dipertahankan
// di response (bukan dihapus dari tipe) supaya app/admin/ExportButton.tsx yang
// sudah null-check data.users/data.payments tidak perlu ikut diubah.
export async function getAdminExportData(opts: AdminExportOptions = {}) {
  const watchlistsPage = await listAllWatchlistsPaginated(opts);

  return {
    users: [] as unknown[],
    watchlists: watchlistsPage.items,
    watchlistsPagination: { nextCursor: watchlistsPage.nextCursor, hasMore: watchlistsPage.hasMore },
    payments: [] as unknown[],
  };
}
