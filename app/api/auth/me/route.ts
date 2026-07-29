import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();

  if (session) {
    return NextResponse.json({ authenticated: true, user: session });
  }

  return NextResponse.json({ authenticated: false }, { status: 401 });
}
