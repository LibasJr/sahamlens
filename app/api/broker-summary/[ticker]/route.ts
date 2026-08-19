import { guard } from '@/lib/sahamLensGuard';
guard();

import { checkPublicComputeBudget } from '@/shared/security/api-rate-limit';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { computeStockBrokerSummary } from '@/modules/broker-flow/service/idx-broker-summary-parser.service';
import { getMarketAwareCacheHeaders } from '@/shared/cache/ttl-policy';
import { runController } from '@/shared/http/next-response.adapter';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  return runController(async () => {
    const budget = await checkPublicComputeBudget(request.headers, 'flow');
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

    const brokerSummary = await computeStockBrokerSummary(ticker);
    if (!brokerSummary) {
      return {
        status: 200,
        body: {
          ticker,
          hasBrokerData: false,
          hasRealBrokerData: false,
          message: 'Data Broker Summary dengan provenance yang diizinkan belum tersedia untuk emiten ini.',
        },
        headers: getMarketAwareCacheHeaders(),
      };
    }

    return {
      status: 200,
      body: {
        ...brokerSummary,
        hasBrokerData: true,
        // Dipertahankan untuk kompatibilitas klien lama, tetapi tidak lagi dipakai sebagai
        // klaim bahwa provider eksternal sudah direkonsiliasi dengan sumber primer.
        hasRealBrokerData: false,
      },
      headers: getMarketAwareCacheHeaders(),
    };
  }, request);
}
