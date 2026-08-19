import { fetchScreenerUniverse, rankScreener, type RiskProfile } from '@/modules/market/service/screener.service';
import { getOrCompute, getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { describeCacheAge } from '@/shared/http/freshness';
import { computeActorFromRequest, consumeComputeBudget } from '@/shared/middleware/compute-budget';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { getSession } from '@/modules/user';
import { runController } from '@/shared/http/next-response.adapter';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE_KEY = COMPUTED_CACHE_KEY.SCREENER_UNIVERSE;

function parsePositiveParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(request: Request) {
  return runController(async () => {
    const { searchParams } = new URL(request.url);
    const profile = (searchParams.get('profile') || 'Moderat') as RiskProfile;
    if (!['Konservatif', 'Moderat', 'Agresif'].includes(profile)) {
      return {
        status: 400,
        body: { error: 'profile harus Konservatif/Moderat/Agresif', code: 'INVALID_RISK_PROFILE' },
      };
    }

    const sectorParam = searchParams.get('sector');
    const sector = sectorParam && sectorParam.trim() ? sectorParam.trim() : undefined;
    const maxPrice = parsePositiveParam(searchParams.get('maxPrice'));
    const minMarketCap = parsePositiveParam(searchParams.get('minMarketCap'));
    const minLiquidity = parsePositiveParam(searchParams.get('minLiquidity'));

    const ttlBefore = await getCacheTtlRemaining(CACHE_KEY);
    const budget = await consumeComputeBudget(
      computeActorFromRequest(request),
      ttlBefore && ttlBefore > 0 ? 1 : 5,
      'public',
    );
    if (!budget.allowed) {
      return {
        status: 429,
        headers: budget.retryAfterSec ? { 'Retry-After': String(budget.retryAfterSec) } : undefined,
        body: {
          error: 'Screener terlalu sering diminta dalam waktu singkat. Coba lagi sebentar.',
          code: 'COMPUTE_BUDGET_EXCEEDED',
        },
      };
    }

    const universe = await getOrCompute(CACHE_KEY, CACHE_TTL_SEC.SCREENER_UNIVERSE, fetchScreenerUniverse);
    const top10 = rankScreener(universe, profile, { sector, maxPrice, minMarketCap, minLiquidity });

    const session = await getSession().catch(() => null);
    const isGuest = !session || typeof session.id !== 'string';
    const visibleStocks = isGuest ? top10.slice(0, 2) : top10;
    const lockedCount = isGuest ? Math.max(0, top10.length - 2) : 0;

    const availableSectors = Array.from(new Set(universe.map((stock) => stock.sector)))
      .sort((a, b) => a.localeCompare(b, 'id'));

    const ttlRemaining = await getCacheTtlRemaining(CACHE_KEY);
    const _meta = describeCacheAge(ttlRemaining, CACHE_TTL_SEC.SCREENER_UNIVERSE);

    return {
      status: 200,
      body: {
        profile,
        analysis: {
          top_10_stocks: visibleStocks,
          total_count: top10.length,
          locked_count: lockedCount,
          is_guest_limited: isGuest,
        },
        availableSectors,
        _meta,
      },
    };
  }, request);
}
