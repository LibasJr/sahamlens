import type { NextRequest } from 'next/server';
import { getLatestMarketIntegrity } from '@/modules/market-data-integrity/repository/market-data-reconciliation.repository';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { runController } from '@/shared/http/next-response.adapter';

export async function GET(request: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  return runController(async () => {
    const { ticker: raw } = await params;
    const ticker = normalizeIdxTickerParam(raw);
    if (!ticker) return { status: 400, body: { error: 'Ticker tidak valid' } };
    const integrity = await getLatestMarketIntegrity(ticker);
    return {
      status: 200,
      body: { ticker, integrity },
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
    };
  }, request);
}
