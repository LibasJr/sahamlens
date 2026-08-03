import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccessLive } from '@/modules/user';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { cacheGet } from '@/shared/cache/redis-cache';
import { readAiPickScores } from '@/shared/cache/ai-pick-cache';
import { rankAiPicks, type BreakoutInfo } from '@/modules/recommendation/service/ai-pick.service';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';

const BREAKOUT_CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';

// TIDAK ADA fallback scan di sini - itu inti perubahannya. Kalau cache belum terisi,
// jawab apa adanya supaya UI bisa bilang "data sedang disiapkan", bukan diam-diam
// menembak Yahoo ratusan kali di dalam request seorang pengguna.
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

    const hasPro = isInternal || anonTrial?.active === true || (await checkProAccessLive(session));
    if (!hasPro) {
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const scoreData = await readAiPickScores();
    if (!scoreData) {
      const notReady = NextResponse.json({ ready: false, items: [], computedAt: null, note: null });
      if (anonTrial) await applyAnonymousTrialCookie(notReady, anonTrial);
      return notReady;
    }

    const cachedBreakout = await cacheGet<any>(BREAKOUT_CACHE_KEY);
    const breakout: BreakoutInfo = {
      breakoutSymbols: (cachedBreakout?.data || []).map((b: any) => b.symbol),
      goldenCrossSymbols: (cachedBreakout?.crossSignals?.golden || []).map((s: any) => s.symbol),
      deadCrossSymbols: (cachedBreakout?.crossSignals?.dead || []).map((s: any) => s.symbol),
    };

    const items = rankAiPicks(scoreData.scores, breakout, scoreData.bearishSymbols);

    // BUG FIX (audit integritas data 2026-08-03): TTL cache skor diperpanjang ke 3 hari
    // (lihat shared/cache/ai-pick-cache.ts) supaya halaman ini tidak kosong total di
    // luar jam bursa - tapi itu berarti data yang disajikan BISA jadi data sesi
    // kemarin/Jumat, bukan hari ini. `stale` memberi tahu UI kapan harus bilang jujur
    // "data sesi terakhir" alih-alih diam-diam menampilkannya seolah baru saja dihitung.
    const ageMinutes = (Date.now() - new Date(scoreData.computedAt).getTime()) / 60000;
    const stale = ageMinutes > 20;

    const response = NextResponse.json({
      ready: true,
      items,
      computedAt: scoreData.computedAt,
      stale,
      note: cachedBreakout ? null : 'Data breakout belum siap - peringkat sementara tanpa bonus breakout & golden cross.',
    });
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
