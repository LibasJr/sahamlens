import { NextResponse } from 'next/server';
import { getSession } from '@/modules/user';
import { fetchDividendUniverse, buildDividendPlan } from '@/modules/fundamental';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

// Menggantikan pemanggilan /api/live/[ticker] di app/dividend/page.tsx (endpoint itu
// cuma balikin harga+volume, tidak pernah punya field quant.* yang dibutuhkan halaman
// itu - lihat modules/fundamental/service/dividend-plan.service.ts untuk detail).
export const maxDuration = 60;

const CACHE_KEY = 'sahamlens:cache:computed:dividend-universe';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const capital = Number(searchParams.get('capital'));
  const targetMonthly = Number(searchParams.get('targetMonthly'));

  if (!Number.isFinite(capital) || capital <= 0) {
    return NextResponse.json({ error: 'Modal awal harus lebih dari 0' }, { status: 400 });
  }
  if (!Number.isFinite(targetMonthly) || targetMonthly < 0) {
    return NextResponse.json({ error: 'Target pasif bulanan tidak valid' }, { status: 400 });
  }

  try {
    const universe = await getOrCompute(CACHE_KEY, CACHE_TTL_SEC.DIVIDEND_UNIVERSE, fetchDividendUniverse);
    const quant = buildDividendPlan(universe, capital, targetMonthly);
    return NextResponse.json({ quant });
  } catch (error) {
    console.error('Dividend plan API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
