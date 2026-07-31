import { NextResponse } from 'next/server';
import { getMarketSummary } from '@/modules/market';

export async function GET() {
  try {
    const data = await getMarketSummary();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
