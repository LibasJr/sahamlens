// Sisa helper limit sisi-KLIEN. Angkanya sendiri tinggal di shared/constants/limits.ts
// (sumber tunggal, dipakai juga oleh penegakan server) - di sini cuma di-re-export supaya
// halaman yang sudah mengimpor dari '@/lib/limits' tidak perlu diubah semua.
//
// PENTING: ini lapisan UI, BUKAN gerbang otorisasi. Penegakan sesungguhnya ada di server
// (modules/watchlist/service/*.service.ts dengan advisory lock, dan
// shared/usage/daily-analisa-quota.ts lewat /api/stock/[ticker]).
//
// Tiga stub mati DIHAPUS di sini (2026-08-11): `getUsedSymbolsToday()` yang selalu
// mengembalikan array kosong, `incrementAnalisa()` yang selalu menjawab
// `{allowed:true, remaining:999}` tanpa menghitung apa pun, dan alias satu baris
// `refreshAdminStatus()`. Ketiganya peninggalan arsitektur lama; yang berbahaya bukan
// kode matinya, tapi namanya - `incrementAnalisa` terbaca seperti penegak kuota padahal
// tidak pernah menolak siapa pun, jadi pemanggil berikutnya mengira kuotanya sudah dijaga.
export { FREE_LIMITS } from '@/shared/constants/limits';
import { FREE_LIMITS } from '@/shared/constants/limits';

// BUG FIX (2026-08-06, dilaporkan user): pelanggan Pro 1 bulan tetap kena notifikasi
// "limit habis". Fungsi ini dulu mengendus cookie - `saham_admin=true`, `role=admin`,
// `role=pro`. Dua yang terakhir tidak pernah cocok untuk pelanggan sungguhan: panel admin
// mengaktifkan Pro dengan HANYA menulis is_pro + pro_expires_at (handleSetProStatus),
// kolom `role` tidak pernah diubah siapa pun. Status Pro sekarang dikirim pemanggil dari
// sumber yang sama dengan gerbang API (hasProAccessFor/fetchProAccess di
// lib/hooks/useAuthUser.ts), bukan ditebak dari cookie yang tidak pernah ditulis.
export function checkWatchlistLimit(currentCount: number, hasPro: boolean) {
  if (hasPro) return { allowed: true };

  if (currentCount >= FREE_LIMITS.WATCHLIST) {
    return { allowed: false, limit: FREE_LIMITS.WATCHLIST };
  }

  return { allowed: true };
}
