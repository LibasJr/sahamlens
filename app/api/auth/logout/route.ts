import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { DEMO_SESSION_COOKIE } from '@/lib/auth';

export async function POST() {
  cookies().delete(DEMO_SESSION_COOKIE);
  return NextResponse.json({ success: true });
}
