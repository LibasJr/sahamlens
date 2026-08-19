import type { NextRequest } from 'next/server';
import { getMarketNews } from '@/modules/news';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import {
  CACHE_TTL_SEC,
  getMarketAwareTtlSec,
  publicCacheHeaders,
} from '@/shared/cache/ttl-policy';
import { runController } from '@/shared/http/next-response.adapter';

export const dynamic = 'force-dynamic';
const CACHE_KEY = COMPUTED_CACHE_KEY.MARKET_NEWS;

export async function GET(request: NextRequest) {
  return runController(async () => {
    const data = await getOrCompute(CACHE_KEY, getMarketAwareTtlSec(), getMarketNews);
    return {
      status: 200,
      body: data,
      headers: publicCacheHeaders(CACHE_TTL_SEC.MARKET_NEWS),
    };
  }, request);
}
