import { NextResponse } from 'next/server';
import { fetchScreenerUniverse, rankScreener, type RiskProfile } from '@/modules/market/service/screener.service';
import { getOrCompute, getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { describeCacheAge } from '@/shared/http/freshness';
import { computeActorFromRequest, consumeComputeBudget } from '@/shared/middleware/compute-budget';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';

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
  try {
    const { searchParams } = new URL(request.url);
    const profile = (searchParams.get('profile') || 'Moderat') as RiskProfile;
    if (!['Konservatif', 'Moderat', 'Agresif'].includes(profile)) {
      return NextResponse.json({ error: 'profile harus Konservatif/Moderat/Agresif' }, { status: 400 });
    }

    // BARU (2026-08-14, masukan review eksternal - filter Sektor & Harga di LensScanner).
    // sector kosong/'Semua Sektor' = tidak difilter. maxPrice yang bukan angka positif
    // diabaikan (fail-open, bukan 400 - jangan gagalkan seluruh pemindaian karena satu
    // parameter opsional rusak).
    const sectorParam = searchParams.get('sector');
    const sector = sectorParam && sectorParam.trim() ? sectorParam.trim() : undefined;
    const maxPriceParam = searchParams.get('maxPrice');
    const maxPriceParsed = maxPriceParam ? Number(maxPriceParam) : null;
    const maxPrice = maxPriceParsed != null && Number.isFinite(maxPriceParsed) && maxPriceParsed > 0 ? maxPriceParsed : undefined;

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
    const top10 = rankScreener(universe, profile, { sector, maxPrice });

    // Daftar sektor untuk dropdown filter frontend - SELALU dari universe PENUH
    // (belum difilter), supaya pilihan yang tersedia tidak diam-diam menyusut begitu
    // pengguna memilih sektor tertentu. Diurutkan alfabet id-ID.
    const availableSectors = Array.from(new Set(universe.map((s) => s.sector))).sort((a, b) => a.localeCompare(b, 'id'));

    // Audit BUILD 001 (item timestamp/freshness) - _meta ADDITIF, tidak mengubah
    // bentuk `analysis` yang sudah ada, supaya frontend lama tidak patah.
    const ttlRemaining = await getCacheTtlRemaining(CACHE_KEY);
    const _meta = describeCacheAge(ttlRemaining, CACHE_TTL_SEC.SCREENER_UNIVERSE);

    return NextResponse.json({ profile, analysis: { top_10_stocks: top10 }, availableSectors, _meta });
  } catch (error: any) {
    console.error('Screener API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
