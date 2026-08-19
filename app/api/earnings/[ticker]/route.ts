import { checkPublicComputeBudget } from '@/shared/security/api-rate-limit';
import { fetchPublicEarningsData } from '@/modules/fundamental/service/public-earnings-data.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { runController } from '@/shared/http/next-response.adapter';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  return runController(async () => {
    const budget = await checkPublicComputeBudget(request.headers, 'earnings');
    if (!budget.allowed) {
      return {
        status: 429,
        body: { error: 'Terlalu banyak permintaan. Coba lagi nanti.' },
        headers: budget.retryAfterSec ? { 'Retry-After': String(budget.retryAfterSec) } : undefined,
      };
    }

    try {
      const { ticker: rawTicker } = await params;
      const ticker = normalizeIdxTickerParam(rawTicker);
      if (!ticker) return { status: 400, body: { error: 'Ticker tidak valid' } };

      const data = await getOrCompute(
        `sahamlens:cache:computed:earnings:${ticker}`,
        CACHE_TTL_SEC.EARNINGS,
        () => fetchPublicEarningsData(ticker),
      );
      return { status: 200, body: data };
    } catch (error) {
      console.error('Public earnings API error:', error);
      return { status: 503, body: { error: 'Data earnings publik belum tersedia untuk emiten ini' } };
    }
  }, request);
}
