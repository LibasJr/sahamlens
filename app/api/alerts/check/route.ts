import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
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
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export async function GET(req: Request) {
  try {
    if (!(await getSession())) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }

    const ip = getClientIp(req);
    const rate = await checkRateLimitShared(ip, Date.now(), RATE_LIMIT_CONFIG);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Terlalu banyak request. Coba lagi nanti.' },
        { status: 429, headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined }
      );
    }

    const result = await checkAndTriggerAlerts(getTrustedAppOrigin());
    return NextResponse.json(result);
  } catch (err) {
    console.error('Error checking alerts:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
