import { NextResponse } from 'next/server';
import { getSession } from '@/modules/user';
import { fetchCorporateCalendar } from '@/modules/market/service/corporate-calendar.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';

// Menggantikan data/calendar.json (dummy statis, "hari ini" ter-mock permanen ke
// 2026-07-28) - lihat corporate-calendar.service.ts untuk alasan cakupan dibatasi ke
// Dividen+Earnings saja (RUPS/Stock Split tidak ada sumber data gratis yang bisa
// diandalkan). Pengunjung tanpa akun bisa akses selama trial 7 hari (lihat
// shared/auth/anonymous-trial.ts) - setelah itu wajib akun, pola sama seperti
// /api/backtest.
const CACHE_KEY = 'sahamlens:cache:computed:corporate-calendar';

export async function GET() {
  const session = await getSession();
  let anonTrial: AnonTrialState | null = null;
  if (!session) {
    anonTrial = await readOrIssueAnonymousTrial();
    if (!anonTrial.active) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }
  }

  try {
    const events = await getOrCompute(CACHE_KEY, CACHE_TTL_SEC.CORPORATE_CALENDAR, fetchCorporateCalendar);
    const response = NextResponse.json({ events });
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error) {
    console.error('Calendar API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
