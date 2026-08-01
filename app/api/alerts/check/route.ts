import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { checkAndTriggerAlerts } from '@/modules/notification';
import { checkRateLimitShared } from '@/shared/middleware/rate-limiter';

// WAJIB - route ini tidak memanggil cookies()/headers() sama sekali, jadi tanpa
// penanda ini Next.js men-static-generate-nya SEKALI saat `next build` dan
// menyajikan hasil beku itu ke SEMUA request selamanya (ditemukan lewat smoke
// test: endpoint selalu balas checked:0 walau ada alert baru di DB). Route yang
// melakukan efek samping (query DB live, tulis triggered=true) tidak boleh statis.
export const dynamic = 'force-dynamic';

// Route ini publik dan TANPA verifikasi signature (lihat catatan lama di
// app/api/cron/watchlist-alert/route.ts - dibiarkan hidup untuk kompatibilitas
// pemanggil eksternal yang belum diketahui). Tapi karena efeknya global (evaluasi +
// trigger alert SEMUA user) dan sebelumnya tanpa proteksi apapun, siapa pun bisa
// spam endpoint ini untuk memboroskan resource/API pihak ketiga. Rate-limit longgar
// per-IP (bukan block total) - cukup untuk mencegah abuse tanpa mematahkan pemanggil
// periodik yang sah.
const RATE_LIMIT_CONFIG = { windowMs: 60_000, maxPerWindow: 2, blockMs: 5 * 60_000 };

function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export async function GET(req: Request) {
  try {
    const ip = getClientIp(req);
    const rate = await checkRateLimitShared(ip, Date.now(), RATE_LIMIT_CONFIG);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Terlalu banyak request. Coba lagi nanti.' },
        { status: 429, headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined }
      );
    }

    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const origin = `${protocol}://${host}`;

    const result = await checkAndTriggerAlerts(origin);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Error checking alerts:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
