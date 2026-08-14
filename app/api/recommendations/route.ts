import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import { analyzeStock } from '@/modules/recommendation';
import { cacheGet, getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { describeCacheAge } from '@/shared/http/freshness';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';
import { getLensScoreValidationStatus } from '@/modules/validation';

// BUILD 006/007 - simbol yang rutin di-scan app/api/cron/recommendation-scan dibaca
// cache-first (per simbol); simbol lain di luar daftar itu tetap dihitung live
// seperti sebelumnya - tidak ada regresi untuk simbol yang belum pernah di-cache.
// Pengunjung tanpa akun bisa akses PENUH tanpa batas waktu - lihat
// shared/auth/session.ts hasOpenOrProAccess().
function cacheKeyFor(symbol: string): string {
  return `sahamlens:cache:computed:recommendation:${symbol}`;
}

export async function GET(request: Request) {
  try {
    const session = await getSession();

    // Cookie trial anonim tetap diterbitkan (telemetri), tapi tidak lagi menggerbang
    // akses - lihat hasOpenOrProAccess() untuk alasannya.
    let anonTrial: AnonTrialState | null = null;
    if (!session) anonTrial = await readOrIssueAnonymousTrial();

    if (!(await hasOpenOrProAccess(session))) {
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
          if (cached) {
            // Audit BUILD 001 (timestamp/freshness) - hasil dari cron-scan cache bisa
            // berumur sampai 18 menit (TTL.RECOMMENDATION_CRON - lihat catatan bug fix
            // 2026-08-14 di cron/recommendation-scan/route.ts; SEBELUMNYA di sini salah
            // memakai TTL.RECOMMENDATION yang cuma 60 detik, membuat describeCacheAge
            // menghitung umur cache dari acuan yang jauh lebih pendek dari TTL sungguhan
            // yang dipakai penulisnya - freshness bisa salah label). Ditandai per-simbol
            // supaya UI bisa bilang jujur "data 12 menit lalu", bukan tersirat baru dihitung.
            const ttlRemaining = await getCacheTtlRemaining(cacheKeyFor(t));
            return { ...cached, _meta: describeCacheAge(ttlRemaining, CACHE_TTL_SEC.RECOMMENDATION_CRON) };
          }
          const fresh = await analyzeStock(t);
          return fresh ? { ...fresh, _meta: { freshness: 'FRESH', cachedAgeSec: 0, cacheTtlSec: CACHE_TTL_SEC.RECOMMENDATION_CRON } } : fresh;
        })
      );
      results.push(...chunkResults.filter(Boolean));
    }

    const response = NextResponse.json({
      recommendations: results,
      modelValidation: getLensScoreValidationStatus(),
    });
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error: any) {
    console.error('Recommendations API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
