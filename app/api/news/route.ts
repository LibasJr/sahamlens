import { NextResponse } from 'next/server';
import { getMarketNews } from '@/modules/news';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { CACHE_TTL_SEC, getMarketAwareTtlSec, publicCacheHeaders } from '@/shared/cache/ttl-policy';

// Publik (halaman Beranda menampilkan ini ke semua user login). Freshness cache
// mengikuti policy pasar: 60 detik saat bursa buka, 30 menit saat bursa tutup.
export const dynamic = 'force-dynamic';

const CACHE_KEY = COMPUTED_CACHE_KEY.MARKET_NEWS;


export async function GET() {
  try {
    const data = await getOrCompute(CACHE_KEY, getMarketAwareTtlSec(), getMarketNews);
    return NextResponse.json(data, { headers: publicCacheHeaders(CACHE_TTL_SEC.MARKET_NEWS) });
  } catch (error: any) {
    console.error('News API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
