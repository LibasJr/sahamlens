import { incrWithExpiry } from '@/shared/cache/redis-cache';

// Jatah tanya-jawab LensAI untuk pengunjung TANPA akun (keputusan produk 2026-08-11).
//
// Sebelumnya guest hanya dibatasi compute budget (shared/middleware/compute-budget.ts:
// tier 'public' 40 unit per jendela 10 MENIT, biaya 3 per pertanyaan = ~13 pertanyaan,
// lalu RESET lagi 10 menit berikutnya) - jadi praktis tidak ada batas total sama sekali.
// Ini batas KERAS sepanjang jendela trial anonim. Compute budget TETAP jalan di
// sampingnya: yang satu mencegah lonjakan CPU, yang ini batas produk.
//
// Kunci diambil dari cookie trial anonim yang ditandatangani server (firstSeenAt),
// BUKAN dari IP - satu Wi-Fi kantor/CGNAT operator dipakai banyak orang, dan memakai IP
// akan menghabiskan jatah orang lain. Konsekuensinya sama dengan trial anonim itu
// sendiri: hapus cookie/incognito = jatah baru, diterima sebagai risiko yang wajar
// (lihat catatan yang sama di shared/auth/anonymous-trial.ts).
export const GUEST_CHAT_LIMIT = 5;

export const GUEST_CHAT_LIMIT_MESSAGE =
  `Jatah ${GUEST_CHAT_LIMIT} pertanyaan LensAI untuk pengunjung sudah habis. Silakan masuk untuk melanjutkan percakapan.`;

// Disamakan dengan umur cookie trial anonim (ANON_TOKEN_TTL_DAYS = 180 hari): counter
// tidak boleh kedaluwarsa lebih dulu daripada cookie yang jadi kuncinya, kalau tidak
// pengunjung yang sama dapat jatah baru padahal cookienya masih yang lama.
const TTL_SEC = 180 * 24 * 60 * 60;

function keyFor(anonId: string): string {
  return `sahamlens:usage:guest-chat:${anonId}`;
}

export interface GuestChatQuota {
  allowed: boolean;
  used: number;
  remaining: number;
  limit: number;
}

/** Pakai SATU jatah pertanyaan guest. Panggil hanya untuk request yang benar-benar
 * akan diproses (prompt sudah lolos validasi), supaya request kosong/invalid tidak
 * ikut memotong jatah. Fail-open kalau Redis tidak terkonfigurasi/down - ini gerbang
 * bisnis, bukan gerbang keamanan, sama seperti daily-analisa-quota.ts. */
export async function consumeGuestChat(anonId: string): Promise<GuestChatQuota> {
  const used = await incrWithExpiry(keyFor(anonId), TTL_SEC);
  if (used === null) {
    return { allowed: true, used: 0, remaining: GUEST_CHAT_LIMIT, limit: GUEST_CHAT_LIMIT };
  }
  return {
    allowed: used <= GUEST_CHAT_LIMIT,
    used,
    remaining: Math.max(0, GUEST_CHAT_LIMIT - used),
    limit: GUEST_CHAT_LIMIT,
  };
}
