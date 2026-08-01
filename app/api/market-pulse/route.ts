import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccess } from '@/modules/user';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { getMarketPulse } from '@/modules/market';
import { cacheGet } from '@/shared/cache/redis-cache';

// BUILD 006/007 - baca cache-first (diisi app/api/cron/market-pulse setiap 5 menit).
// Cache-miss (schedule belum sempat jalan, atau Redis belum dikonfigurasi) tetap
// fallback ke komputasi live supaya endpoint tidak pernah gagal keras.
const CACHE_KEY = 'sahamlens:cache:computed:market-pulse';

export async function GET(request: Request) {
  try {
    const isInternal = isInternalServiceRequest(request);
    const session = isInternal ? null : await getSession();
    if (!isInternal && !session) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }

    const hasPro = isInternal ? true : checkProAccess(session);
    if (!hasPro) {
      // 402 (bukan 429) - lihat catatan yang sama di app/api/breakout-radar/route.ts.
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const cached = await cacheGet<any>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    const data = await getMarketPulse();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Market pulse API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
