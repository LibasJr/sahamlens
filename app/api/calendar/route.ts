import { NextResponse } from 'next/server';
import { fetchCorporateCalendar } from '@/modules/market/service/corporate-calendar.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';

// Menggantikan data/calendar.json (dummy statis, "hari ini" ter-mock permanen ke
// 2026-07-28) - lihat corporate-calendar.service.ts untuk alasan cakupan dibatasi ke
// Dividen+Earnings saja (RUPS/Stock Split tidak ada sumber data gratis yang bisa
// diandalkan). Public-read karena Corporate Calendar ada di menu guest; endpoint ini
// hanya mengembalikan agenda pasar/cache publik, bukan data user.
const CACHE_KEY = COMPUTED_CACHE_KEY.CORPORATE_CALENDAR;

export async function GET() {
  try {
    const events = await getOrCompute(CACHE_KEY, CACHE_TTL_SEC.CORPORATE_CALENDAR, fetchCorporateCalendar);
    return NextResponse.json({ events });
  } catch (error) {
    console.error('Calendar API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
