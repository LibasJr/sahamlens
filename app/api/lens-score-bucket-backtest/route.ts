import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, hasOpenOrProAccess, isAdminServer } from '@/modules/user';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { runLensScoreBucketBacktest } from '@/modules/recommendation/service/lens-score-bucket-backtest.service';
import { logger } from '@/shared/logger/logger';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

// Kunci per scoreVersion (default 'default' kalau parameter tidak dikirim) - satu
// key literal per varian, bukan lewat COMPUTED_CACHE_KEY karena endpoint ini
// satu-satunya pembaca (lihat aturan di shared/cache/computed-keys.ts).
function cacheKeyFor(scoreVersion: string | null): string {
  return `sahamlens:cache:computed:lens-score-bucket-backtest:${scoreVersion ?? 'default'}`;
}

export async function GET(request: Request) {
  try {
    const isInternal = isInternalServiceRequest(request);
    const session = isInternal ? null : await getSession();

    // Cookie trial anonim tetap diterbitkan (telemetri), tapi tidak lagi menggerbang
    // akses - lihat hasOpenOrProAccess() untuk alasannya.
    let anonTrial: AnonTrialState | null = null;
    if (!isInternal && !session) anonTrial = await readOrIssueAnonymousTrial();

    if (!isInternal && !(await hasOpenOrProAccess(session))) {
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    // Backtest bucket adalah alat kalibrasi internal, bukan fitur pengguna. Membatasi
    // hanya di render halaman tidak cukup: endpoint-nya tetap bisa dipanggil langsung
    // oleh siapa pun yang punya akun Pro. Sumber status admin sama dengan yang dipakai
    // Sidebar - cookie admin HttpOnly atau role pada sesi login.
    if (!isInternal && !(await isAdminServer()) && session?.role !== 'admin') {
      return NextResponse.json({ error: 'Khusus admin', code: 'ADMIN_REQUIRED' }, { status: 403 });
    }

    const scoreVersion = new URL(request.url).searchParams.get('scoreVersion');
    // BUG FIX (2026-08-14, laporan pengguna "LensRadar lambat"): sebelumnya endpoint
    // ini query SELURUH tabel lens_radar_history dan hitung ulang t-test/kalibrasi
    // LIVE di setiap request - tanpa cache sama sekali. getOrCompute (single-flight)
    // dipakai supaya cache-miss bersamaan (banyak pengunjung buka LensRadar sekaligus)
    // tidak memicu banyak query+komputasi paralel ke Postgres.
    const result = await getOrCompute(
      cacheKeyFor(scoreVersion),
      CACHE_TTL_SEC.LENS_BUCKET_BACKTEST,
      () => runLensScoreBucketBacktest(undefined, { scoreVersion }),
    );
    const response = NextResponse.json(result);
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error) {
    logger.error('GET /api/lens-score-bucket-backtest gagal', { error });
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
