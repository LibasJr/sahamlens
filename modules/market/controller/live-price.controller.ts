import type { HttpResult } from '@/shared/types/http-result.types';
import { checkPublicComputeBudget, rateLimitResult } from '@/shared/security/api-rate-limit';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { fetchLivePriceSnapshot } from '../service/live-price.service';

export async function handleGetLivePrice(request: Request, rawTicker: string): Promise<HttpResult> {
  const budget = await checkPublicComputeBudget(request.headers, 'live');
  if (!budget.allowed) return rateLimitResult(budget);

  const ticker = normalizeIdxTickerParam(rawTicker, { allowMarketIndex: true });
  if (!ticker) return { status: 400, body: { error: 'Ticker tidak valid' } };

  const result = await fetchLivePriceSnapshot(ticker);
  return {
    status: result.available ? 200 : 503,
    body: result.body,
    headers: result.headers,
  };
}
