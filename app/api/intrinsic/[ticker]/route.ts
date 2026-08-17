import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { checkPublicComputeBudget, rateLimitExceeded } from '@/shared/security/api-rate-limit';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { calculateIntrinsicValue } from '@/modules/fundamental';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { getSession } from '@/modules/user';

// BUILD 004 (AI Architecture) - logika DCF/Graham/PBV/PER/DDM dipindah ke
// modules/fundamental/service/dcf-valuation.service.ts (dipakai ulang oleh
// Valuation Agent di orkestrator multi-agent). Route ini kini thin controller.
// /dcf sengaja TIDAK di PROTECTED_PAGES (alat publik gratis) - route ini
// dibiarkan tanpa auth, konsisten dengan halaman yang memanggilnya.
//
// BUG FIX (2026-08-14, audit "semua menu harus ada cache") - dipanggil dari
// components/IntrinsicValue.tsx di halaman /fundamental, TANPA cache sama sekali
// sebelumnya - calculateIntrinsicValue() dihitung ulang live tiap kali kartu itu
// dirender, walau /api/fundamental/[ticker] untuk ticker yang SAMA sudah di-cache.
// getOrCompute dipakai dengan pola sama (null dibungkus supaya ticker tak dikenal
// juga ikut ter-cache, bukan menembak live berulang).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const budget = await checkPublicComputeBudget(request.headers, 'intrinsic');
  if (!budget.allowed) return rateLimitExceeded(budget);
  try {
    const { ticker: rawTicker } = await params;
    const ticker = normalizeIdxTickerParam(rawTicker);
    if (!ticker) return NextResponse.json({ error: 'Ticker tidak valid' }, { status: 400 });
    const wrapped = await getOrCompute(
      `sahamlens:cache:computed:intrinsic:${ticker}`,
      CACHE_TTL_SEC.TECHNICAL,
      async () => {
        const result = await calculateIntrinsicValue(ticker);
        return result ?? { notFound: true as const };
      },
    );
    if ('notFound' in wrapped) {
      return NextResponse.json({ error: 'No data found' }, { status: 404 });
    }

    const session = await getSession().catch(() => null);
    const isGuest = !session || typeof session.id !== 'string';

    if (isGuest) {
      return NextResponse.json({
        ...wrapped,
        applied_rule: {},
        assumptions: {
          is_model_estimate: true,
          is_guest_limited: true,
        },
        is_guest_limited: true,
      });
    }

    return NextResponse.json({
      ...wrapped,
      is_guest_limited: false,
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
