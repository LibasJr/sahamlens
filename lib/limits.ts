// checkAnalisaLimit/decrementAnalisaLimit (limit analisa bot Telegram, berbasis
// shim lib/supabase.ts) dihapus - login/bot Telegram sudah tidak dipakai, dan kedua
// fungsi ini sudah jadi dead code (di-import tapi tidak pernah dipanggil di
// app/api/stock/[ticker]/route.ts). Limit yang aktif sekarang murni checkProAccess
// (shared/auth/session.ts).

import { fetchProAccess } from './hooks/useAuthUser';

export const FREE_LIMITS = {
  WATCHLIST: 3,
  ALERTS: 2,
  analisaPerHari: 5
};

// BUG FIX (2026-08-06, dilaporkan user): pelanggan Pro 1 bulan tetap kena notifikasi
// "limit habis". Semua fungsi di bawah dulu mengendus cookie - `saham_admin=true`,
// `role=admin`, `role=pro`. Dua yang terakhir tidak pernah cocok untuk pelanggan
// sungguhan: panel admin mengaktifkan Pro dengan HANYA menulis is_pro +
// pro_expires_at (handleSetProStatus), kolom `role` tidak pernah diubah siapa pun,
// dan cookie `role` hanya pernah diisi nilai 'admin' saat login admin. Jadi status
// Pro sekarang ditanyakan ke server (sumber yang sama dengan gerbang API), bukan
// ditebak dari cookie yang tidak pernah ditulis.
export function checkWatchlistLimit(currentCount: number, hasPro: boolean) {
  if (hasPro) return { allowed: true };

  if (currentCount >= FREE_LIMITS.WATCHLIST) {
    return { allowed: false, limit: FREE_LIMITS.WATCHLIST };
  }

  return { allowed: true };
}

export async function refreshAdminStatus() {
  return fetchProAccess();
}

export function getUsedSymbolsToday() {
  // Now handled by server-side usage_logs, returning empty array to satisfy frontend types
  return [];
}

export function incrementAnalisa(symbol: string) {
  // Real check is now done Server-Side via /api/stock/[ticker]
  // This just bypasses the old client side check
  return { allowed: true, remaining: 999 };
}

export function grantProFromLink() {
  // Legacy function for client-side pro granting, replaced by admin panel
}


