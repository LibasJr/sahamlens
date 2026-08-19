import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { idxTickerParamSchema } from '@/shared/market/ticker-schema';
import { checkPublicComputeBudget, rateLimitExceeded } from '@/shared/security/api-rate-limit';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { computeStockBrokerSummary } from '@/modules/broker-flow/service/idx-broker-summary-parser.service';
import { getMarketAwareCacheHeaders } from '@/shared/cache/ttl-policy';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const budget = await checkPublicComputeBudget(request.headers, 'flow');
  if (!budget.allowed) return rateLimitExceeded(budget);

  return runController(async () => {
    const { ticker: rawTicker } = await params;
    const ticker = parseOrThrow(idxTickerParamSchema, rawTicker);
  {
    const brokerSummary = await computeStockBrokerSummary(ticker);

    if (!brokerSummary) {
      return { status: 200, headers: getMarketAwareCacheHeaders(), body:
        {
          ticker,
          hasBrokerData: false,
          hasRealBrokerData: false,
          message: 'Data Broker Summary dengan provenance yang diizinkan belum tersedia untuk emiten ini.',
        } };
    }

    return { status: 200, headers: getMarketAwareCacheHeaders(), body:
      {
        ...brokerSummary,
        hasBrokerData: true,
        // Dipertahankan untuk kompatibilitas klien lama, tetapi tidak lagi dipakai sebagai
        // klaim bahwa provider eksternal sudah direkonsiliasi dengan sumber primer.
        hasRealBrokerData: false,
      } };
  }
    // catch generik dihapus: runController menghasilkan 500 yang sama sambil mencatat
    // error lengkap ke shared/logger dengan X-Request-Id yang juga diterima klien.
  });
}
