import { NextResponse } from 'next/server';
import { getStockNews } from '@/modules/news';
import { getOrCompute } from '@/shared/cache/redis-cache';

// Berita spesifik per-emiten (bukan pasar umum, lihat catatan di news.service.ts).
export const dynamic = 'force-dynamic';
const TTL_SEC = 15 * 60;

export async function GET(request: Request, { params }: { params: { ticker: string } }) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name') || undefined;
    const code = params.ticker.replace('.JK', '').toUpperCase();
    const data = await getOrCompute(
      `sahamlens:cache:computed:stock-news:${code}`,
      TTL_SEC,
      () => getStockNews(code, name)
    );
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
