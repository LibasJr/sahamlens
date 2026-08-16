import { NextResponse } from 'next/server';
import { getLatestMarketIntegrity } from '@/modules/market-data-integrity/repository/market-data-reconciliation.repository';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const ticker = normalizeIdxTickerParam(raw);
  if (!ticker) return NextResponse.json({ error: 'Ticker tidak valid' }, { status: 400 });
  const integrity = await getLatestMarketIntegrity(ticker);
  return NextResponse.json({ ticker, integrity }, { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' } });
}
