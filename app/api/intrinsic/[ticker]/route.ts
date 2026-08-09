import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { calculateIntrinsicValue } from '@/modules/fundamental';

// BUILD 004 (AI Architecture) - logika DCF/Graham/PBV/PER/DDM dipindah ke
// modules/fundamental/service/dcf-valuation.service.ts (dipakai ulang oleh
// Valuation Agent di orkestrator multi-agent). Route ini kini thin controller.
// /dcf sengaja TIDAK di PROTECTED_PAGES (alat publik gratis) - route ini
// dibiarkan tanpa auth, konsisten dengan halaman yang memanggilnya.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker: rawTicker } = await params;
    const ticker = normalizeIdxTickerParam(rawTicker);
    if (!ticker) return NextResponse.json({ error: 'Ticker tidak valid' }, { status: 400 });
    const result = await calculateIntrinsicValue(ticker);
    if (!result) {
      return NextResponse.json({ error: 'No data found' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
