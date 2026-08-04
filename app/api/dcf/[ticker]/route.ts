import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { calculateDcfModel } from '@/modules/fundamental';

// /dcf sengaja publik (alat gratis, konsisten dengan /api/intrinsic/[ticker]) - lihat
// catatan di app/api/intrinsic/[ticker]/route.ts. Sebelumnya app/dcf/page.tsx memanggil
// /api/live/[ticker] (cuma quote harga) yang tidak pernah punya field quant/analysis,
// jadi WACC/FCF projections/sensitivity table selalu tampil "-". Endpoint ini mengisi
// data itu dari model DCF nyata di modules/fundamental/service/dcf-valuation.service.ts.
export const revalidate = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;
    const result = await calculateDcfModel(ticker);
    if (!result) {
      return NextResponse.json({ error: 'Data DCF tidak tersedia untuk simbol ini' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
