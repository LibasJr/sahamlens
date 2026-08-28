import { getTrustedClientIp } from '@/shared/http/client-ip';
import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { checkTriggerAndDispatchAlerts } from '@/modules/notification';
import { checkRateLimitShared } from '@/shared/middleware/rate-limiter';
import { getTrustedAppOrigin } from '@/shared/http/server-origin';
import { getSession } from '@/modules/user';
import { logger } from '@/shared/logger/logger';

// WAJIB - route ini tidak memanggil cookies()/headers() sama sekali, jadi tanpa
// penanda ini Next.js men-static-generate-nya SEKALI saat `next build` dan
// menyajikan hasil beku itu ke SEMUA request selamanya (ditemukan lewat smoke
// test: endpoint selalu balas checked:0 walau ada alert baru di DB). Route yang
// melakukan efek samping (query DB live, tulis triggered=true) tidak boleh statis.
export const dynamic = 'force-dynamic';

// Endpoint manual tetap global karena evaluator historisnya lintas user. Alert user
// lain yang ikut terpicu tetap dikirim lewat Web Push. Push untuk user yang sedang
// menekan tombol dilewati supaya tidak duplikat dengan Notification foreground lama
// di halaman watchlist.
const RATE_LIMIT_CONFIG = { windowMs: 60_000, maxPerWindow: 2, blockMs: 5 * 60_000 };

function getClientIp(req: Request): string {
  return getTrustedClientIp(req.headers);
}

export async function GET(req: Request) {
  return runController(async () => {
    try {
      const session = await getSession();
      if (!session) {
        return { status: 401, body: { error: 'Belum login' } };
      }

      const ip = getClientIp(req);
      const rate = await checkRateLimitShared(ip, Date.now(), RATE_LIMIT_CONFIG);
      if (!rate.allowed) {
        return {
          status: 429,
          body: { error: 'Terlalu banyak request. Coba lagi nanti.' },
          headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined,
        };
      }

      const result = await checkTriggerAndDispatchAlerts(getTrustedAppOrigin(), {
        skipPushUserId: session.id,
      });
      return { status: 200, body: result };
    } catch (err) {
      logger.error('Manual alert check failed', { module: 'watchlist-alert', err });
      return { status: 500, body: { error: 'Internal Server Error' } };
    }
  }, req);
}
