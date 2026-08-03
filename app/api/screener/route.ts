import { NextResponse } from 'next/server';
import { fetchScreenerUniverse, rankScreener, type RiskProfile } from '@/modules/market/service/screener.service';
import { getOrCompute, getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { describeCacheAge } from '@/shared/http/freshness';

// Publik (alat gratis, konsisten dengan /dcf & /screener page itu sendiri). Universe
// mentah (fetch fundamental ~50 saham) di-cache 30 menit dan dipakai ulang untuk
// skoring ketiga profil risiko - skoring itu sendiri murah/instan jadi tidak perlu
// cache terpisah per profil.
export const dynamic = 'force-dynamic';
// Butuh lebih lama sejak universe menarik histori 1y per saham (Signal/Pattern Tag/
// Sentimen, bukan cuma 1mo) - hanya kena saat cache 30 menit basi/pertama dihitung.
export const maxDuration = 60;

const CACHE_KEY = 'sahamlens:cache:computed:screener-universe';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profile = (searchParams.get('profile') || 'Moderat') as RiskProfile;
    if (!['Konservatif', 'Moderat', 'Agresif'].includes(profile)) {
      return NextResponse.json({ error: 'profile harus Konservatif/Moderat/Agresif' }, { status: 400 });
    }

    const universe = await getOrCompute(CACHE_KEY, CACHE_TTL_SEC.SCREENER_UNIVERSE, fetchScreenerUniverse);
    const top10 = rankScreener(universe, profile);

    // Audit BUILD 001 (item timestamp/freshness) - _meta ADDITIF, tidak mengubah
    // bentuk `analysis` yang sudah ada, supaya frontend lama tidak patah.
    const ttlRemaining = await getCacheTtlRemaining(CACHE_KEY);
    const _meta = describeCacheAge(ttlRemaining, CACHE_TTL_SEC.SCREENER_UNIVERSE);

    return NextResponse.json({ profile, analysis: { top_10_stocks: top10 }, _meta });
  } catch (error: any) {
    console.error('Screener API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
