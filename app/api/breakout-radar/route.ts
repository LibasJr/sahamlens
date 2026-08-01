import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccess } from '@/modules/user';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { scanBreakouts, scanCrossSignals } from '@/modules/recommendation';
import { cacheGet } from '@/shared/cache/redis-cache';

// BUILD 006/007 - baca cache-first (diisi app/api/cron/breakout-scan setiap 5 menit).
const CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';

export async function GET(request: Request) {
  try {
    const isInternal = isInternalServiceRequest(request);
    const session = isInternal ? null : await getSession();
    if (!isInternal && !session) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }

    const hasPro = isInternal ? true : checkProAccess(session);
    if (!hasPro) {
      // 402 (bukan 429) - ini soal akses langganan, bukan rate limit. Pesan lama
      // "Limit analisa harian habis" menyesatkan karena tidak ada penghitung kuota
      // sungguhan untuk fitur ini (temuan H9, API Guideline poin 2 prioritas adopsi).
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const cached = await cacheGet<any>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    const [data, crossSignals] = await Promise.all([scanBreakouts(), scanCrossSignals()]);

    return NextResponse.json({
      data,
      crossSignals,
      lastUpdate: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
