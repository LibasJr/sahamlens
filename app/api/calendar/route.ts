import { runController } from '@/shared/http/next-response.adapter';
import { fetchCorporateCalendar } from '@/modules/market/service/corporate-calendar.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC, publicCacheHeaders } from '@/shared/cache/ttl-policy';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';

// Menggantikan data/calendar.json (dummy statis, "hari ini" ter-mock permanen ke
// 2026-07-28) - lihat corporate-calendar.service.ts untuk alasan cakupan dibatasi ke
// Dividen+Earnings saja (RUPS/Stock Split tidak ada sumber data gratis yang bisa
// diandalkan). Public-read karena Corporate Calendar ada di menu guest; endpoint ini
// hanya mengembalikan agenda pasar/cache publik, bukan data user.
const CACHE_KEY = COMPUTED_CACHE_KEY.CORPORATE_CALENDAR;

export async function GET() {
  return runController(async () => {
    const events = await getOrCompute(CACHE_KEY, CACHE_TTL_SEC.CORPORATE_CALENDAR, fetchCorporateCalendar);
    // catch generik dihapus: runController menghasilkan 500 "Internal Server Error"
    // yang sama, tapi mencatatnya ke shared/logger dengan X-Request-Id yang juga
    // diterima klien - kaitan yang tidak pernah dimiliki console.error.
    return { status: 200, body: { events }, headers: publicCacheHeaders(CACHE_TTL_SEC.CORPORATE_CALENDAR) };
  });
}
