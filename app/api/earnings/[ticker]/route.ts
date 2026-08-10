import { NextResponse } from 'next/server';
import { fetchPublicEarningsData } from '@/modules/fundamental/service/public-earnings-data.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  try {
    const { ticker: rawTicker } = await params;
    const ticker = normalizeIdxTickerParam(rawTicker);
    if (!ticker) {
      return NextResponse.json({ error: 'Ticker tidak valid' }, { status: 400 });
    }

    const data = await getOrCompute(
      'sahamlens:cache:computed:earnings:' + ticker,
      CACHE_TTL_SEC.EARNINGS,
      () => fetchPublicEarningsData(ticker),
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error('Public earnings API error:', error);
    return NextResponse.json(
      { error: 'Data earnings publik belum tersedia untuk emiten ini' },
      { status: 503 },
    );
  }
}
