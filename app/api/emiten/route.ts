import type { NextRequest } from 'next/server';
import { loadEmitenList } from '@/shared/market/emiten-list';
import { runController } from '@/shared/http/next-response.adapter';

export const revalidate = 3600; // company list barely changes

export async function GET(request: NextRequest) {
  return runController(async () => {
    const emiten = loadEmitenList();
    return { status: 200, body: { count: emiten.length, emiten } };
  }, request);
}
