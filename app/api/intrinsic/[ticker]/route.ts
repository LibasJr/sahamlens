import { guard } from '@/lib/sahamLensGuard';
guard();

import { checkPublicComputeBudget } from '@/shared/security/api-rate-limit';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { calculateIntrinsicValue } from '@/modules/fundamental';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { getSession } from '@/modules/user';
import { runController } from '@/shared/http/next-response.adapter';

// BUILD 004 (AI Architecture) - logika DCF/Graham/PBV/PER/DDM dipindah ke
// modules/fundamental/service/dcf-valuation.service.ts (dipakai ulang oleh
// Valuation Agent di orkestrator multi-agent). Route ini kini thin controller.
// /dcf sengaja TIDAK di PROTECTED_PAGES (alat publik gratis) - route ini
// dibiarkan tanpa auth, konsisten dengan halaman yang memanggilnya.
//
// Cache server-side mencegah kalkulasi intrinsic identik dihitung ulang pada setiap
// render fundamental. Null dibungkus menjadi notFound supaya negative lookup ikut cache.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  return runController(async () => {
    const budget = await checkPublicComputeBudget(request.headers, 'intrinsic');
    if (!budget.allowed) {
      return {
        status: 429,
        body: { error: 'Terlalu banyak permintaan. Coba lagi nanti.' },
        headers: budget.retryAfterSec ? { 'Retry-After': String(budget.retryAfterSec) } : undefined,
      };
    }

    const { ticker: rawTicker } = await params;
    const ticker = normalizeIdxTickerParam(rawTicker);
    if (!ticker) return { status: 400, body: { error: 'Ticker tidak valid' } };

    const wrapped = await getOrCompute(
      `sahamlens:cache:computed:intrinsic:${ticker}`,
      CACHE_TTL_SEC.TECHNICAL,
      async () => {
        const result = await calculateIntrinsicValue(ticker);
        return result ?? { notFound: true as const };
      },
    );
    if ('notFound' in wrapped) return { status: 404, body: { error: 'No data found' } };

    const session = await getSession().catch(() => null);
    const isGuest = !session || typeof session.id !== 'string';
    if (isGuest) {
      return {
        status: 200,
        body: {
          ...wrapped,
          applied_rule: {},
          assumptions: { is_model_estimate: true, is_guest_limited: true },
          is_guest_limited: true,
        },
      };
    }

    return { status: 200, body: { ...wrapped, is_guest_limited: false } };
  }, request);
}
