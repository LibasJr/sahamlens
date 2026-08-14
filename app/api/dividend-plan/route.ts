import { NextResponse } from 'next/server';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import { fetchDividendUniverse, buildDividendPlan } from '@/modules/fundamental';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';

// Menggantikan pemanggilan /api/live/[ticker] di app/dividend/page.tsx (endpoint itu
// cuma balikin harga+volume, tidak pernah punya field quant.* yang dibutuhkan halaman
// itu - lihat modules/fundamental/service/dividend-plan.service.ts untuk detail).
export const maxDuration = 60;

const CACHE_KEY = COMPUTED_CACHE_KEY.DIVIDEND_UNIVERSE;

export async function GET(request: Request) {
  // Tamu (session null) dapat akses PENUH tanpa perlu login - keputusan produk
  // 2026-08-13, lihat hasOpenOrProAccess(). Akun terdaftar tetap lewat gerbang
  // trial/Pro seperti sebelumnya (Pro yang baru diaktifkan admin langsung berlaku
  // tanpa menunggu JWT diperbarui, karena hasOpenOrProAccess memanggil versi live).
  const session = await getSession();
  if (!(await hasOpenOrProAccess(session))) {
    return NextResponse.json(
      { error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' },
      { status: 402 },
    );
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
