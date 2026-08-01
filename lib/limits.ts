// checkAnalisaLimit/decrementAnalisaLimit (limit analisa bot Telegram, berbasis
// shim lib/supabase.ts) dihapus - login/bot Telegram sudah tidak dipakai, dan kedua
// fungsi ini sudah jadi dead code (di-import tapi tidak pernah dipanggil di
// app/api/stock/[ticker]/route.ts). Limit yang aktif sekarang murni checkProAccess
// (shared/auth/session.ts).

export const FREE_LIMITS = {
  WATCHLIST: 3,
  ALERTS: 2,
  analisaPerHari: 5
};

export function checkWatchlistLimit(currentCount: number) {
  // Check if admin on client side (using cookies usually, but let's mock if not available)
  let isAdmin = false;
  if (typeof document !== 'undefined') {
    isAdmin = document.cookie.includes('saham_admin=true') || document.cookie.includes('role=admin') || document.cookie.includes('role=pro');
  }
  
  if (isAdmin) return { allowed: true };
  
  if (currentCount >= FREE_LIMITS.WATCHLIST) {
    return { allowed: false, limit: FREE_LIMITS.WATCHLIST };
  }
  
  return { allowed: true };
}

export async function refreshAdminStatus() {
  return hasProAccess();
}

export function hasProAccess() {
  if (typeof document !== 'undefined') {
    return document.cookie.includes('saham_admin=true') || 
           document.cookie.includes('role=admin') || 
           document.cookie.includes('role=pro');
  }
  return false;
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


