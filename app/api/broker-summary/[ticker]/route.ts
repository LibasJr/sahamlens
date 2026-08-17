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
          status: 'DATA_UNAVAILABLE',
          source: null,
          message: 'Data Broker Summary EOD belum tersedia untuk emiten ini pada tanggal bursa terakhir.',
        },
        { headers: getMarketAwareCacheHeaders() }
      );
    }

    // `hasRealBrokerData` diturunkan dari provenance baris, BUKAN dari "query
    // mengembalikan sesuatu". Sebelumnya flag ini selalu true begitu rows.length > 0,
    // sehingga ia menyatakan klaim tentang asal data tanpa pernah memeriksa asalnya.
    const { provenance } = brokerSummary;
    const hasRealBrokerData = provenance.sources.length > 0 && provenance.lastImportedAt != null;

    return NextResponse.json(
      {
        ...brokerSummary,
        hasRealBrokerData,
        status: hasRealBrokerData ? 'OK' : 'PROVENANCE_UNVERIFIED',
      },
      { headers: getMarketAwareCacheHeaders() }
    );
  } catch (error: any) {
    console.error('[GET /api/broker-summary/[ticker]] error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
