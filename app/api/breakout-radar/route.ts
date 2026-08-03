import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccessLive } from '@/modules/user';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { cacheGet } from '@/shared/cache/redis-cache';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';

// BUILD 006/007 - baca cache-first (diisi app/api/cron/breakout-scan setiap 5 menit).
// Pengunjung tanpa akun bisa akses selama trial 7 hari (lihat
// shared/auth/anonymous-trial.ts) - trial aktif melewati gerbang Pro juga.
const CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';

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
      // 402 (bukan 429) - ini soal akses langganan, bukan rate limit. Pesan lama
      // "Limit analisa harian habis" menyesatkan karena tidak ada penghitung kuota
      // sungguhan untuk fitur ini (temuan H9, API Guideline poin 2 prioritas adopsi).
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const cached = await cacheGet<any>(CACHE_KEY);
    if (cached) {
      const response = NextResponse.json(cached);
      if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
      return response;
    }

    // Cache belum terisi - jawab kosong, JANGAN memindai. Pemindaian adalah tugas
    // /api/cron/breakout-scan; menjalankannya di request pengguna berarti satu orang
    // menanggung ~109 fetch Yahoo dan halaman menggantung puluhan detik.
    const empty = NextResponse.json({ data: [], crossSignals: { golden: [], dead: [] }, lastUpdate: null });
    if (anonTrial) await applyAnonymousTrialCookie(empty, anonTrial);
    return empty;
  } catch (error) {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
