import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getMarketPulse } from '@/modules/market';
import { cacheGet } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';

// BUILD 006/007 - baca cache-first (diisi app/api/cron/market-pulse setiap 5 menit).
// Cache-miss (schedule belum sempat jalan, atau Redis belum dikonfigurasi) tetap fallback
// ke komputasi live supaya endpoint tidak pernah gagal keras. Endpoint ini public-read:
// /market-pulse adalah menu guest, jadi tidak boleh kosong hanya karena anonymous trial
// lama sudah kedaluwarsa. Data yang dikembalikan adalah ringkasan pasar/cache publik,
// bukan data akun atau otorisasi user.
const CACHE_KEY = COMPUTED_CACHE_KEY.MARKET_PULSE;

export async function GET() {
  try {
    const cached = await cacheGet<any>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    const data = await getMarketPulse();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Market pulse API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
