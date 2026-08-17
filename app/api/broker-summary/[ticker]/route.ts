import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
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

  const { ticker: rawTicker } = await params;
  const ticker = normalizeIdxTickerParam(rawTicker);
  if (!ticker) return NextResponse.json({ error: 'Ticker tidak valid' }, { status: 400 });

  try {
    const brokerSummary = await computeStockBrokerSummary(ticker);

    if (!brokerSummary) {
      return NextResponse.json(
        {
          ticker,
          hasRealBrokerData: false,
          message: 'Data Broker Summary EOD belum tersedia untuk emiten ini pada tanggal bursa terakhir.',
        },
        { headers: getMarketAwareCacheHeaders() }
      );
    }

    return NextResponse.json(
      {
        ...brokerSummary,
        hasRealBrokerData: true,
      },
      { headers: getMarketAwareCacheHeaders() }
    );
  } catch (error: any) {
    console.error('[GET /api/broker-summary/[ticker]] error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
