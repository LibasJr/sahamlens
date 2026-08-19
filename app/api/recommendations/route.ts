import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { SubscriptionRequiredError } from '@/shared/errors/app-error';
import { idxTickerParamSchema } from '@/shared/market/ticker-schema';
import { z } from 'zod';

// `symbols` DULU dipecah dengan koma tanpa validasi DAN TANPA BATAS JUMLAH, lalu setiap
// elemen langsung diteruskan ke analyzeStock(). `?symbols=A,B,...` sepanjang apa pun
// karena itu memicu sebanyak itu pula analisa - satu request bisa menyeret ratusan
// panggilan penyedia data. Endpoint ini publik untuk tamu.
//
// Batas 25 dipilih dari pemakaian NYATA, bukan ditebak: app/recommendations/page.tsx
// mengirim maksimal 10 simbol per request (chunkSize = 10), jadi 25 memberi ruang lebar
// untuk pemanggil lain tanpa mengubah perilaku yang ada sama sekali.
//
// Tiap elemen dinormalisasi lewat idxTickerParamSchema yang sama dengan route [ticker],
// jadi 'bbca' dan 'BBCA' sama-sama menjadi 'BBCA.JK' - dan sampah ditolak 400 alih-alih
// diteruskan ke penyedia untuk gagal di sana.
const recommendationsQuerySchema = z
  .string()
  .transform((raw) => raw.split(',').map((part) => part.trim()).filter(Boolean))
  .pipe(z.array(idxTickerParamSchema).min(1, 'symbols kosong').max(25, 'Maksimal 25 simbol per permintaan'));
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import { analyzeStock } from '@/modules/recommendation';
import { cacheGet, getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { describeCacheAge } from '@/shared/http/freshness';
import { readOrIssueAnonymousTrial, buildAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';
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
  return runController(async () => {
    const session = await getSession();

    // Cookie trial anonim tetap diterbitkan (telemetri), tapi tidak lagi menggerbang
    // akses - lihat hasOpenOrProAccess() untuk alasannya.
    let anonTrial: AnonTrialState | null = null;
    if (!session) anonTrial = await readOrIssueAnonymousTrial();

    if (!(await hasOpenOrProAccess(session))) {
      // 402 (bukan 429) - lihat catatan yang sama di app/api/breakout-radar/route.ts.
      throw new SubscriptionRequiredError();
    }

    const url = new URL(request.url);
    const symbolsParam = url.searchParams.get('symbols');
    const symbols = symbolsParam ? parseOrThrow(recommendationsQuerySchema, symbolsParam) : ['BBCA.JK'];

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

    const trialCookie = anonTrial ? await buildAnonymousTrialCookie(anonTrial) : null;
    // catch generik dihapus: runController menghasilkan 500 yang sama sambil mencatat
    // error lengkap ke shared/logger dengan X-Request-Id yang juga diterima klien.
    return {
      status: 200,
      ...(trialCookie ? { cookiesToSet: [trialCookie] } : {}),
      body: {
      recommendations: results,
      // Semua hasil menyimpan timestamp quote provider. Snapshot agregat ini dipakai
      // UI agar tidak memberi label "Update sekarang" pada harga sesi sebelumnya.
      dataTimestamp: results
        .map((result: any) => result?.dataTimestamp)
        .filter((timestamp): timestamp is string => typeof timestamp === 'string')
        .sort()
        .at(-1) ?? null,
      modelValidation: getLensScoreValidationStatus(),
      },
    };
  });
}
