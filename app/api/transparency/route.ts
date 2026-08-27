import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { publicCacheHeaders, CACHE_TTL_SEC, CDN_FRESHNESS_SEC } from '@/shared/cache/ttl-policy';
import { getPublicTransparencyData } from '@/modules/lens-radar/service/transparency.service';

export const maxDuration = 300;

// Public layer: methodology, model status, sample counts, data as-of, limitations.
// No raw samples, calibration rows, anomalous rows, or operator diagnostics.
export async function GET(request: Request) {
  return runController(async () => ({
    status: 200,
    body: await getPublicTransparencyData(),
    headers: publicCacheHeaders(CDN_FRESHNESS_SEC.LENS_RADAR, CACHE_TTL_SEC.LENS_TRANSPARENCY),
  }), request);
}
