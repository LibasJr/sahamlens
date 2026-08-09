import { NextResponse } from 'next/server';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { getStockNews } from '@/modules/news';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { getMarketAwareTtlSec } from '@/shared/cache/ttl-policy';

// Berita spesifik per-emiten (bukan pasar umum, lihat catatan di news.service.ts).
export const dynamic = 'force-dynamic';


export async function GET(request: Request, { params }: { params: Promise<{ ticker: string }> }) {
  try {
    const { ticker: rawTicker } = await params;
    const ticker = normalizeIdxTickerParam(rawTicker);
    if (!ticker) return NextResponse.json({ error: 'Ticker tidak valid' }, { status: 400 });
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name') || undefined;
    const code = ticker.replace('.JK', '');
    const data = await getOrCompute(
      `sahamlens:cache:computed:stock-news:${code}`,
      getMarketAwareTtlSec(),
      () => getStockNews(code, name)
    );
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Stock news API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
