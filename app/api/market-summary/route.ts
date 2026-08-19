import { runController } from '@/shared/http/next-response.adapter';
import { getMarketSummary } from '@/modules/market';
import { getOrCompute, getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC, publicCacheHeaders } from '@/shared/cache/ttl-policy';
import { describeCacheAge } from '@/shared/http/freshness';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';

// BUILD 007 (Cache Layer) - sebelumnya endpoint ini (public/no-auth, dipakai landing
// page) TIDAK PERNAH di-cache sama sekali. getOrCompute (single-flight) dipakai,
// bukan cacheGet/cacheSet manual, karena endpoint ini yang paling rawan diakses
// bersamaan oleh banyak pengunjung anonim sekaligus (tanpa gesekan login) - tanpa
// proteksi stampede, cache-miss bersamaan bisa memicu banyak komputasi ulang paralel.
const CACHE_KEY = COMPUTED_CACHE_KEY.MARKET_SUMMARY;

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
  return runController(async () => {
    const data = await getOrCompute(CACHE_KEY, CACHE_TTL_SEC.MARKET_SUMMARY, getMarketSummary);
    // Audit BUILD 001 (timestamp/freshness) - _meta ADDITIF, tidak menyentuh field
    // yang sudah ada di `data`.
    //
    // BUG FIX (2026-08-14): acuan freshness DIPISAH dari TTL penulisan getOrCompute di
    // atas (yang SENGAJA tetap pendek untuk fallback live - lihat komentar
    // MARKET_SUMMARY di ttl-policy.ts). Cache key ini SAMA PERSIS dibaca cron
    // market-summary yang menulis dengan MARKET_SUMMARY_CRON (6 menit) - kalau acuan
    // freshness di sini masih pakai MARKET_SUMMARY (60 detik) sementara entri yang
    // dibaca ditulis cron dengan TTL 6 menit, describeCacheAge menghitung umur dari
    // acuan yang jauh lebih pendek dari TTL sungguhan dan salah label (selalu "FRESH").
    const ttlRemaining = await getCacheTtlRemaining(CACHE_KEY);
    const _meta = describeCacheAge(ttlRemaining, CACHE_TTL_SEC.MARKET_SUMMARY_CRON);
    // catch generik dihapus: runController sudah mengubah error tak terduga jadi 500
    // "Internal Server Error" yang sama, tapi SEKALIGUS mencatatnya ke shared/logger
    // dengan X-Request-Id yang sama seperti yang diterima klien. console.error yang
    // digantikannya tidak punya kaitan itu, jadi satu laporan bug tidak pernah bisa
    // ditelusuri ke baris lognya.
    return {
      status: 200,
      body: { ...data, _meta },
      headers: publicCacheHeaders(CACHE_TTL_SEC.MARKET_SUMMARY),
    };
  });
}
