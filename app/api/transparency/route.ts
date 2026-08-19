import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { getTransparencyData } from '@/modules/lens-radar/service/transparency.service';
import { CDN_FRESHNESS_SEC, CACHE_TTL_SEC, publicCacheHeaders } from '@/shared/cache/ttl-policy';

export const maxDuration = 300;

export async function GET() {
  return runController(async () => ({
    status: 200,
    body: await getTransparencyData(),
    headers: publicCacheHeaders(CDN_FRESHNESS_SEC.TRANSPARENCY, CACHE_TTL_SEC.LENS_TRANSPARENCY),
  }));
}
