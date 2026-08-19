import { fetchCorporateCalendar } from '@/modules/market/service/corporate-calendar.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC, publicCacheHeaders } from '@/shared/cache/ttl-policy';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { runController } from '@/shared/http/next-response.adapter';

// Menggantikan data/calendar.json (dummy statis, "hari ini" ter-mock permanen ke
// 2026-07-28). Public-read karena Corporate Calendar ada di menu guest; endpoint ini
// hanya mengembalikan agenda pasar/cache publik, bukan data user.
const CACHE_KEY = COMPUTED_CACHE_KEY.CORPORATE_CALENDAR;

export async function GET(request: Request) {
  return runController(async () => {
    const events = await getOrCompute(
      CACHE_KEY,
      CACHE_TTL_SEC.CORPORATE_CALENDAR,
      fetchCorporateCalendar,
    );
    return {
      status: 200,
      body: { events },
      headers: publicCacheHeaders(CACHE_TTL_SEC.CORPORATE_CALENDAR),
    };
  }, request);
}
