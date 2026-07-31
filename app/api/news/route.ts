import { NextResponse } from 'next/server';
import { getMarketNews } from '@/modules/news';
import { getOrCompute } from '@/shared/cache/redis-cache';

// Publik (halaman Beranda menampilkan ini ke semua user login). Cache 15 menit -
// berita tidak berubah sedetik-detik, dan ini hemat kuota Council AI (sentimen
// dihitung ulang cuma sekali per 15 menit, bukan tiap kali halaman Beranda dibuka).
export const dynamic = 'force-dynamic';

const CACHE_KEY = 'sahamlens:cache:computed:market-news';
const TTL_SEC = 15 * 60;

export async function GET() {
  try {
    const data = await getOrCompute(CACHE_KEY, TTL_SEC, getMarketNews);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
