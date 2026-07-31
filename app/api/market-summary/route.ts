import { NextResponse } from 'next/server';
import { getMarketSummary } from '@/modules/market';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

// BUILD 007 (Cache Layer) - sebelumnya endpoint ini (public/no-auth, dipakai landing
// page) TIDAK PERNAH di-cache sama sekali. getOrCompute (single-flight) dipakai,
// bukan cacheGet/cacheSet manual, karena endpoint ini yang paling rawan diakses
// bersamaan oleh banyak pengunjung anonim sekaligus (tanpa gesekan login) - tanpa
// proteksi stampede, cache-miss bersamaan bisa memicu banyak komputasi ulang paralel.
const CACHE_KEY = 'sahamlens:cache:computed:market-summary';

// WAJIB - route ini tidak memanggil cookies()/headers(), jadi tanpa penanda ini
// Next.js men-static-generate-nya SEKALI saat `next build` dan menyajikan hasil
// beku itu ke SEMUA request selamanya sampai deploy berikutnya (temuan nyata: build
// output SEBELUM perubahan ini menandai route ini "○ Static" - Redis cache di atas
// jadi percuma karena getMarketSummary() cuma pernah jalan sekali, saat build,
// bukan per-request). Pola sama seperti app/api/alerts/check/route.ts.
export const dynamic = 'force-dynamic';
// Universe naik dari 50 -> 250 saham (lihat market-summary.service.ts) - beri jatah waktu
// lebih longgar untuk komputasi cache-miss (25 saham per chunk, ~10 putaran) supaya tidak
// timeout di platform serverless yang mendukung durasi lebih panjang dari default.
export const maxDuration = 60;

export async function GET() {
  try {
    const data = await getOrCompute(CACHE_KEY, CACHE_TTL_SEC.MARKET_SUMMARY, getMarketSummary);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
