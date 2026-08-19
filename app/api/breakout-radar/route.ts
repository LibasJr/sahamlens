import { guard } from '@/lib/sahamLensGuard';
guard();

import type { NextRequest } from 'next/server';
import { cacheGet } from '@/shared/cache/redis-cache';
import { runController } from '@/shared/http/next-response.adapter';

const CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';

export async function GET(request: NextRequest) {
  return runController(async () => {
    try {
      const cached = await cacheGet<any>(CACHE_KEY);
      if (cached) return { status: 200, body: cached };

      // Cache belum terisi - jawab kosong, JANGAN memindai. Pemindaian adalah tugas
      // /api/cron/breakout-scan agar request user tidak menanggung full-universe fetch.
      return {
        status: 200,
        body: { data: [], crossSignals: { golden: [], dead: [] }, lastUpdate: null },
      };
    } catch {
      return { status: 500, body: { error: 'Server Error' } };
    }
  }, request);
}
