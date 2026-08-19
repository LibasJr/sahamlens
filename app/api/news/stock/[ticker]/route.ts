import { runController } from '@/shared/http/next-response.adapter';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { idxTickerParamSchema } from '@/shared/market/ticker-schema';
import { checkPublicComputeBudget, rateLimitExceeded } from '@/shared/security/api-rate-limit';
import { getStockNews } from '@/modules/news';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { getMarketAwareTtlSec } from '@/shared/cache/ttl-policy';

// Berita spesifik per-emiten (bukan pasar umum, lihat catatan di news.service.ts).
export const dynamic = 'force-dynamic';


export async function GET(request: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const budget = await checkPublicComputeBudget(request.headers, 'stock-news');
  if (!budget.allowed) return rateLimitExceeded(budget);

  return runController(async () => {
    const { ticker: rawTicker } = await params;
    const ticker = parseOrThrow(idxTickerParamSchema, rawTicker);
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name') || undefined;
    const code = ticker.replace('.JK', '');
    const data = await getOrCompute(
      `sahamlens:cache:computed:stock-news:v2:${code}`,
      getMarketAwareTtlSec(),
      () => getStockNews(code, name)
    );
    // catch generik dihapus: runController menghasilkan 500 yang sama sambil mencatat
    // error lengkap ke shared/logger dengan X-Request-Id yang juga diterima klien.
    return { status: 200, body: data };
  });
}
