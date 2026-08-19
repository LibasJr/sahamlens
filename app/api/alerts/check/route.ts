import { getTrustedClientIp } from '@/shared/http/client-ip';
import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { UnauthorizedError, RateLimitedError } from '@/shared/errors/app-error';
import { checkAndTriggerAlerts } from '@/modules/notification';
import { checkRateLimitShared } from '@/shared/middleware/rate-limiter';
import { getTrustedAppOrigin } from '@/shared/http/server-origin';
import { getSession } from '@/modules/user';

// WAJIB - route ini tidak memanggil cookies()/headers() sama sekali, jadi tanpa
// penanda ini Next.js men-static-generate-nya SEKALI saat `next build` dan
// menyajikan hasil beku itu ke SEMUA request selamanya (ditemukan lewat smoke
// test: endpoint selalu balas checked:0 walau ada alert baru di DB). Route yang
// melakukan efek samping (query DB live, tulis triggered=true) tidak boleh statis.
export const dynamic = 'force-dynamic';

// PERBAIKAN KEAMANAN (2026-08-11). Catatan lama di app/api/cron/watchlist-alert/route.ts
// membiarkan endpoint ini TANPA autentikasi apa pun karena "tidak tahu apakah ada pemicu
// eksternal yang bergantung padanya". Pemanggilnya sudah ditelusuri dan cuma SATU, yaitu
// aplikasi ini sendiri: tombol "cek alert" di app/watchlist/page.tsx (triggerCron), yang
// hanya bisa dijangkau user yang sudah login. Jadwal periodik resmi jalan lewat jalur
// QStash terverifikasi (/api/cron/watchlist-alert), bukan lewat sini.
//
// Efek endpoint ini GLOBAL: mengevaluasi + men-trigger alert SELURUH user, memanggil API
// harga pihak ketiga, dan menulis triggered=true di DB. Tanpa gerbang, siapa pun tanpa
// akun bisa memaksa evaluasi penuh berulang-ulang (boros kuota provider, dan alert user
// lain ikut "terpakai" lebih awal dari yang dijadwalkan). Sekarang wajib sesi login;
// rate-limit per-IP tetap dipertahankan sebagai lapisan kedua.
const RATE_LIMIT_CONFIG = { windowMs: 60_000, maxPerWindow: 2, blockMs: 5 * 60_000 };

function getClientIp(req: Request): string {
  return getTrustedClientIp(req.headers);
}

export async function GET(req: Request) {
  return runController(async () => {
    if (!(await getSession())) throw new UnauthorizedError();

    const ip = getClientIp(req);
    const rate = await checkRateLimitShared(ip, Date.now(), RATE_LIMIT_CONFIG);
    if (!rate.allowed) {
      // RateLimitedError meneruskan Retry-After lewat toErrorResponse (lihat
      // shared/errors/app-error.ts), jadi header yang dulu disusun tangan di sini tetap
      // terkirim - sekarang plus `code: 'RATE_LIMITED'` yang sebelumnya tidak ada.
      throw new RateLimitedError('Terlalu banyak request. Coba lagi nanti.', rate.retryAfterSec);
    }

    const result = await checkAndTriggerAlerts(getTrustedAppOrigin());
    // catch generik dihapus: runController menghasilkan 500 yang sama sambil mencatat
    // error lengkap ke shared/logger dengan X-Request-Id yang juga diterima klien.
    return { status: 200, body: result };
  });
}
