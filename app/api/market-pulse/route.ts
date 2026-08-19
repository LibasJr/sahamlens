import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getMarketPulse } from '@/modules/market';
import { cacheGet, cacheSet } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { CACHE_TTL_SEC as TTL, CDN_FRESHNESS_SEC, publicCacheHeaders } from '@/shared/cache/ttl-policy';

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
      return NextResponse.json(cached, { headers: publicCacheHeaders(CDN_FRESHNESS_SEC.MARKET_PULSE) });
    }

    const data = await getMarketPulse();
    // Cache-miss dapat terjadi di akhir pekan ketika cron tidak berjalan. Simpan
    // snapshot hasil fallback agar satu pengunjung tidak memicu ulang 100 quote Yahoo
    // untuk setiap refresh, dan semua pengguna menerima daftar breadth yang sama.
    await cacheSet(CACHE_KEY, data, TTL.MARKET_PULSE_CRON);
    return NextResponse.json(data, { headers: publicCacheHeaders(CDN_FRESHNESS_SEC.MARKET_PULSE) });
  } catch (error: any) {
    console.error('Market pulse API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
