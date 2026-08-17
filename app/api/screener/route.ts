import { NextResponse } from 'next/server';
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

/** Angka positif dari query param, atau `undefined` kalau kosong/rusak - fail-open,
 * satu parameter opsional yang rusak tidak boleh menggagalkan seluruh pemindaian. */
function parsePositiveParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profile = (searchParams.get('profile') || 'Moderat') as RiskProfile;
    if (!['Konservatif', 'Moderat', 'Agresif'].includes(profile)) {
      return NextResponse.json({ error: 'profile harus Konservatif/Moderat/Agresif' }, { status: 400 });
    }

    // BARU (2026-08-14, masukan review eksternal - filter Sektor/Harga/Market Cap/
    // Likuiditas di LensScanner). sector kosong/'Semua Sektor' = tidak difilter.
    const sectorParam = searchParams.get('sector');
    const sector = sectorParam && sectorParam.trim() ? sectorParam.trim() : undefined;
    const maxPrice = parsePositiveParam(searchParams.get('maxPrice'));
    // minMarketCap & minLiquidity dikirim frontend dalam Rupiah PENUH (bukan
    // miliar/triliun) - konsisten dengan market_cap/adv20_idr mentah di response.
    const minMarketCap = parsePositiveParam(searchParams.get('minMarketCap'));
    const minLiquidity = parsePositiveParam(searchParams.get('minLiquidity'));

    const ttlBefore = await getCacheTtlRemaining(CACHE_KEY);
    const budget = await consumeComputeBudget(
      computeActorFromRequest(request),
      ttlBefore && ttlBefore > 0 ? 1 : 5,
      'public',
    );
    if (!budget.allowed) {
      return NextResponse.json(
        { error: 'Screener terlalu sering diminta dalam waktu singkat. Coba lagi sebentar.', code: 'COMPUTE_BUDGET_EXCEEDED' },
        { status: 429, headers: budget.retryAfterSec ? { 'Retry-After': String(budget.retryAfterSec) } : undefined },
      );
    }

    const universe = await getOrCompute(CACHE_KEY, CACHE_TTL_SEC.SCREENER_UNIVERSE, fetchScreenerUniverse);
    const top10 = rankScreener(universe, profile, { sector, maxPrice, minMarketCap, minLiquidity });

    const session = await getSession().catch(() => null);
    const isGuest = !session || typeof session.id !== 'string';
    const visibleStocks = isGuest ? top10.slice(0, 3) : top10;
    const lockedCount = isGuest ? Math.max(0, top10.length - 3) : 0;

    // Daftar sektor untuk dropdown filter frontend - SELALU dari universe PENUH
    // (belum difilter), supaya pilihan yang tersedia tidak diam-diam menyusut begitu
    // pengguna memilih sektor tertentu. Diurutkan alfabet id-ID.
    const availableSectors = Array.from(new Set(universe.map((s) => s.sector))).sort((a, b) => a.localeCompare(b, 'id'));

    // Audit BUILD 001 (item timestamp/freshness) - _meta ADDITIF, tidak mengubah
    // bentuk `analysis` yang sudah ada, supaya frontend lama tidak patah.
    const ttlRemaining = await getCacheTtlRemaining(CACHE_KEY);
    const _meta = describeCacheAge(ttlRemaining, CACHE_TTL_SEC.SCREENER_UNIVERSE);

    return NextResponse.json({
      profile,
      analysis: {
        top_10_stocks: visibleStocks,
        total_count: top10.length,
        locked_count: lockedCount,
        is_guest_limited: isGuest,
      },
      availableSectors,
      _meta,
    });
  } catch (error: any) {
    console.error('Screener API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
