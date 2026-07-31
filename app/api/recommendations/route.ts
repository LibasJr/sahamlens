import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccess } from '@/modules/user';
import { analyzeStock } from '@/modules/recommendation';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }

    const hasPro = checkProAccess(session);
    if (!hasPro) {
      // 402 (bukan 429) - lihat catatan yang sama di app/api/breakout-radar/route.ts.
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const url = new URL(request.url);
    const symbolsParam = url.searchParams.get('symbols');
    const symbols = symbolsParam ? symbolsParam.split(',') : ['BBCA.JK'];

    const results = [];
    const chunkSize = 5;
    for (let i = 0; i < symbols.length; i += chunkSize) {
      const chunk = symbols.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(chunk.map(t => analyzeStock(t)));
      results.push(...chunkResults.filter(Boolean));
    }

    return NextResponse.json({ recommendations: results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
