import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccessLive } from '@/modules/user';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { getMarketPulse } from '@/modules/market';
import { cacheGet } from '@/shared/cache/redis-cache';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';

// BUILD 006/007 - baca cache-first (diisi app/api/cron/market-pulse setiap 5 menit).
// Cache-miss (schedule belum sempat jalan, atau Redis belum dikonfigurasi) tetap
// fallback ke komputasi live supaya endpoint tidak pernah gagal keras. Pengunjung
// tanpa akun bisa akses selama trial 7 hari (lihat shared/auth/anonymous-trial.ts) -
// trial aktif melewati gerbang Pro juga, setara akun yang sedang trial.
const CACHE_KEY = 'sahamlens:cache:computed:market-pulse';

export async function GET(request: Request) {
  try {
    const isInternal = isInternalServiceRequest(request);
    const session = isInternal ? null : await getSession();

    let anonTrial: AnonTrialState | null = null;
    if (!isInternal && !session) {
      anonTrial = await readOrIssueAnonymousTrial();
      if (!anonTrial.active) {
        return NextResponse.json({ error: 'Belum login' }, { status: 401 });
      }
    }

    const hasPro = isInternal || anonTrial?.active === true || await checkProAccessLive(session);
    if (!hasPro) {
      // 402 (bukan 429) - lihat catatan yang sama di app/api/breakout-radar/route.ts.
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const cached = await cacheGet<any>(CACHE_KEY);
    if (cached) {
      const response = NextResponse.json(cached);
      if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
      return response;
    }

    const data = await getMarketPulse();
    const response = NextResponse.json(data);
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error: any) {
    console.error('Market pulse API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
