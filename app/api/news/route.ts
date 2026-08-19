import { runController } from '@/shared/http/next-response.adapter';
import { getMarketNews } from '@/modules/news';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { CACHE_TTL_SEC, getMarketAwareTtlSec, publicCacheHeaders } from '@/shared/cache/ttl-policy';

// Publik (halaman Beranda menampilkan ini ke semua user login). Freshness cache
// mengikuti policy pasar: 60 detik saat bursa buka, 30 menit saat bursa tutup.
export const dynamic = 'force-dynamic';

const CACHE_KEY = COMPUTED_CACHE_KEY.MARKET_NEWS;


export async function GET() {
  return runController(async () => {
    const data = await getOrCompute(CACHE_KEY, getMarketAwareTtlSec(), getMarketNews);
    // catch generik dihapus: runController menghasilkan 500 "Internal Server Error"
    // yang sama, tapi mencatatnya ke shared/logger dengan X-Request-Id yang juga
    // diterima klien - kaitan yang tidak pernah dimiliki console.error.
    return { status: 200, body: data, headers: publicCacheHeaders(CACHE_TTL_SEC.MARKET_NEWS) };
  });
}
