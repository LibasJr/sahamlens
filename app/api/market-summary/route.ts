import type { NextRequest } from 'next/server';
import { getMarketSummary } from '@/modules/market';
import { getOrCompute, getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC, publicCacheHeaders } from '@/shared/cache/ttl-policy';
import { describeCacheAge } from '@/shared/http/freshness';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { runController } from '@/shared/http/next-response.adapter';

const CACHE_KEY = COMPUTED_CACHE_KEY.MARKET_SUMMARY;

// Route ini membaca keadaan pasar per-request. Tanpa force-dynamic, build dapat
// membekukan snapshot publik menjadi static output dan membuat Redis tidak efektif.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return runController(async () => {
    const data = await getOrCompute(
      CACHE_KEY,
      CACHE_TTL_SEC.MARKET_SUMMARY,
      getMarketSummary,
    );
    const ttlRemaining = await getCacheTtlRemaining(CACHE_KEY);
    const _meta = describeCacheAge(ttlRemaining, CACHE_TTL_SEC.MARKET_SUMMARY_CRON);

    return {
      status: 200,
      body: { ...data, _meta },
      headers: publicCacheHeaders(CACHE_TTL_SEC.MARKET_SUMMARY),
    };
  }, request);
}
