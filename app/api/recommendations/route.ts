import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccess } from '@/modules/user';
import { analyzeStock } from '@/modules/recommendation';
import { cacheGet } from '@/shared/cache/redis-cache';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';

// BUILD 006/007 - simbol yang rutin di-scan app/api/cron/recommendation-scan dibaca
// cache-first (per simbol); simbol lain di luar daftar itu tetap dihitung live
// seperti sebelumnya - tidak ada regresi untuk simbol yang belum pernah di-cache.
// Pengunjung tanpa akun bisa akses selama trial 7 hari (lihat
// shared/auth/anonymous-trial.ts) - trial aktif melewati gerbang Pro juga.
function cacheKeyFor(symbol: string): string {
  return `sahamlens:cache:computed:recommendation:${symbol}`;
}

export async function GET(request: Request) {
  try {
    const session = await getSession();

    let anonTrial: AnonTrialState | null = null;
    if (!session) {
      anonTrial = await readOrIssueAnonymousTrial();
      if (!anonTrial.active) {
        return NextResponse.json({ error: 'Belum login' }, { status: 401 });
      }
    }

    const hasPro = anonTrial?.active === true || checkProAccess(session);
    if (!hasPro) {
      // 402 (bukan 429) - lihat catatan yang sama di app/api/breakout-radar/route.ts.
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const url = new URL(request.url);
    const symbolsParam = url.searchParams.get('symbols');
    const symbols = symbolsParam ? symbolsParam.split(',') : ['BBCA.JK'];

    const results = [];
    const chunkSize = 5;
    for (let i = 0; i < symbols.length; i += chunkSize) {
      const chunk = symbols.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(
        chunk.map(async (t) => {
          const cached = await cacheGet<any>(cacheKeyFor(t));
          if (cached) return cached;
          return analyzeStock(t);
        })
      );
      results.push(...chunkResults.filter(Boolean));
    }

    const response = NextResponse.json({ recommendations: results });
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error: any) {
    console.error('Recommendations API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
