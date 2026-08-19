import { guard } from '@/lib/sahamLensGuard';
guard();

import { getMarketPulse } from '@/modules/market';
import { cacheGet, cacheSet } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import {
  CACHE_TTL_SEC as TTL,
  CDN_FRESHNESS_SEC,
  publicCacheHeaders,
} from '@/shared/cache/ttl-policy';
import { runController } from '@/shared/http/next-response.adapter';

// Baca cache-first yang normalnya diisi cron. Cache-miss tetap dihitung live lalu
// disimpan agar refresh publik berikutnya tidak memicu ulang universe market pulse.
const CACHE_KEY = COMPUTED_CACHE_KEY.MARKET_PULSE;

export async function GET(request: Request) {
  return runController(async () => {
    const cached = await cacheGet<any>(CACHE_KEY);
    if (cached) {
      return {
        status: 200,
        body: cached,
        headers: publicCacheHeaders(CDN_FRESHNESS_SEC.MARKET_PULSE),
      };
    }

    const data = await getMarketPulse();
    await cacheSet(CACHE_KEY, data, TTL.MARKET_PULSE_CRON);
    return {
      status: 200,
      body: data,
      headers: publicCacheHeaders(CDN_FRESHNESS_SEC.MARKET_PULSE),
    };
  }, request);
}
