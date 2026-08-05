import { NextResponse } from 'next/server';
import { loadEmitenList } from '@/shared/market/emiten-list';

export const revalidate = 3600; // company list barely changes

export async function GET() {
  try {
    const emiten = loadEmitenList();
    return NextResponse.json({ count: emiten.length, emiten });
  } catch (error: any) {
    console.error('Emiten API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
