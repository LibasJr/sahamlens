import { runController } from '@/shared/http/next-response.adapter';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { RateLimitedError } from '@/shared/errors/app-error';
import { z } from 'zod';

// Empat parameter opsional yang dulu diurai tangan lewat parsePositiveParam() -
// helper fail-open yang mengembalikan undefined untuk apa pun yang tidak masuk akal,
// termasuk nilai negatif yang jelas salah tulis. Perilaku itu DIPERTAHANKAN persis
// (`.catch(undefined)`), karena satu filter yang rusak memang tidak boleh
// menggagalkan seluruh pemindaian - tapi sekarang aturannya tertulis satu kali di
// sini alih-alih tersebar sebagai helper lokal per route.
//
// `profile` sebaliknya TIDAK fail-open: nilainya menentukan bobot skor, jadi profil
// yang tidak dikenal harus ditolak, bukan diam-diam diperlakukan sebagai 'Moderat'.
const screenerQuerySchema = z.object({
  profile: z.enum(['Konservatif', 'Moderat', 'Agresif'], {
    message: 'profile harus Konservatif/Moderat/Agresif',
  }).default('Moderat'),
  sector: z.string().trim().min(1).optional().catch(undefined),
  maxPrice: z.coerce.number().finite().positive().optional().catch(undefined),
  minMarketCap: z.coerce.number().finite().positive().optional().catch(undefined),
  minLiquidity: z.coerce.number().finite().positive().optional().catch(undefined),
});
import { fetchScreenerUniverse, rankScreener, type RiskProfile } from '@/modules/market/service/screener.service';
import { getOrCompute, getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { describeCacheAge } from '@/shared/http/freshness';
import { computeActorFromRequest, consumeComputeBudget } from '@/shared/middleware/compute-budget';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { getSession } from '@/modules/user';

// Publik (alat gratis, konsisten dengan /dcf & /screener page itu sendiri). Universe
// mentah (fetch fundamental ~50 saham) di-cache 30 menit dan dipakai ulang untuk
// skoring ketiga profil risiko - skoring itu sendiri murah/instan jadi tidak perlu
// cache terpisah per profil.
export const dynamic = 'force-dynamic';
// Butuh lebih lama sejak universe menarik histori 1y per saham (Signal/Pattern Tag/
// Sentimen, bukan cuma 1mo) - hanya kena saat cache 30 menit basi/pertama dihitung.
export const maxDuration = 60;

const CACHE_KEY = COMPUTED_CACHE_KEY.SCREENER_UNIVERSE;

export async function GET(request: Request) {
  return runController(async () => {
    const { searchParams } = new URL(request.url);
    // minMarketCap & minLiquidity dikirim frontend dalam Rupiah PENUH (bukan
    // miliar/triliun) - konsisten dengan market_cap/adv20_idr mentah di response.
    // sector kosong/'Semua Sektor' = tidak difilter (skema mengubahnya jadi undefined).
    const { profile, sector, maxPrice, minMarketCap, minLiquidity } = parseOrThrow(
      screenerQuerySchema,
      {
        profile: searchParams.get('profile') ?? undefined,
        sector: searchParams.get('sector') ?? undefined,
        maxPrice: searchParams.get('maxPrice') ?? undefined,
        minMarketCap: searchParams.get('minMarketCap') ?? undefined,
        minLiquidity: searchParams.get('minLiquidity') ?? undefined,
      },
    );

    const ttlBefore = await getCacheTtlRemaining(CACHE_KEY);
    const budget = await consumeComputeBudget(
      computeActorFromRequest(request),
      ttlBefore && ttlBefore > 0 ? 1 : 5,
      'public',
    );
    if (!budget.allowed) {
      // RateLimitedError meneruskan Retry-After lewat toErrorResponse, jadi header yang
      // dulu disusun tangan tetap terkirim. `code` berubah dari COMPUTE_BUDGET_EXCEEDED
      // (di luar katalog ErrorCode) ke RATE_LIMITED yang memang ada di katalog - keduanya
      // 429, dan yang kedua bisa ditangani klien lewat switch(error.code).
      throw new RateLimitedError(
        'Screener terlalu sering diminta dalam waktu singkat. Coba lagi sebentar.',
        budget.retryAfterSec,
      );
    }

    const universe = await getOrCompute(CACHE_KEY, CACHE_TTL_SEC.SCREENER_UNIVERSE, fetchScreenerUniverse);
    const top10 = rankScreener(universe, profile, { sector, maxPrice, minMarketCap, minLiquidity });

    const session = await getSession().catch(() => null);
    const isGuest = !session || typeof session.id !== 'string';
    const visibleStocks = isGuest ? top10.slice(0, 2) : top10;
    const lockedCount = isGuest ? Math.max(0, top10.length - 2) : 0;

    // Daftar sektor untuk dropdown filter frontend - SELALU dari universe PENUH
    // (belum difilter), supaya pilihan yang tersedia tidak diam-diam menyusut begitu
    // pengguna memilih sektor tertentu. Diurutkan alfabet id-ID.
    const availableSectors = Array.from(new Set(universe.map((s) => s.sector))).sort((a, b) => a.localeCompare(b, 'id'));

    // Audit BUILD 001 (item timestamp/freshness) - _meta ADDITIF, tidak mengubah
    // bentuk `analysis` yang sudah ada, supaya frontend lama tidak patah.
    const ttlRemaining = await getCacheTtlRemaining(CACHE_KEY);
    const _meta = describeCacheAge(ttlRemaining, CACHE_TTL_SEC.SCREENER_UNIVERSE);

    return { status: 200, body: {
      profile,
      analysis: {
        top_10_stocks: visibleStocks,
        total_count: top10.length,
        locked_count: lockedCount,
        is_guest_limited: isGuest,
      },
      availableSectors,
      _meta,
    } };
    // catch generik dihapus: runController menghasilkan 500 yang sama sambil mencatat
    // error lengkap ke shared/logger dengan X-Request-Id yang juga diterima klien.
  });
}
