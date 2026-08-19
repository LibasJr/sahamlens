import type { NextRequest } from 'next/server';
import { fetchPublicMacroDashboard } from '@/modules/macro/service/public-macro-dashboard.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC, CDN_FRESHNESS_SEC, publicCacheHeaders } from '@/shared/cache/ttl-policy';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { runController } from '@/shared/http/next-response.adapter';

const CACHE_KEY = COMPUTED_CACHE_KEY.MACRO_DASHBOARD;

export async function GET(request: NextRequest) {
  return runController(async () => {
    try {
      const data = await getOrCompute(
        CACHE_KEY,
        CACHE_TTL_SEC.MACRO_DASHBOARD,
        fetchPublicMacroDashboard,
      );
      return {
        status: 200,
        body: data,
        headers: publicCacheHeaders(CDN_FRESHNESS_SEC.MACRO, CACHE_TTL_SEC.MACRO_DASHBOARD),
      };
    } catch (error) {
      console.error('Public macro dashboard API error:', error);
      return { status: 503, body: { error: 'Data makro publik belum dapat dimuat' } };
    }
  }, request);
}
