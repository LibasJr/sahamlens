import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminFromRequestCookies } from '@/lib/auth';
import { getStatsToday } from '@/lib/serverStats';

export async function GET() {
  if (!isAdminFromRequestCookies(cookies())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json(getStatsToday());
}
