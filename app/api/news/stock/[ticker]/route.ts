import { checkPublicComputeBudget } from '@/shared/security/api-rate-limit';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { getStockNews } from '@/modules/news';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { getMarketAwareTtlSec } from '@/shared/cache/ttl-policy';
import { runController } from '@/shared/http/next-response.adapter';

// Berita spesifik per-emiten (bukan pasar umum, lihat catatan di news.service.ts).
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ ticker: string }> }) {
  return runController(async () => {
    const budget = await checkPublicComputeBudget(request.headers, 'stock-news');
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

    const name = new URL(request.url).searchParams.get('name') || undefined;
    const code = ticker.replace('.JK', '');
    const data = await getOrCompute(
      `sahamlens:cache:computed:stock-news:v2:${code}`,
      getMarketAwareTtlSec(),
      () => getStockNews(code, name),
    );
    return { status: 200, body: data };
  }, request);
}
