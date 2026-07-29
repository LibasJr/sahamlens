import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDemoSession } from '@/lib/auth';

export async function GET() {
  const session = getDemoSession(cookies());

  if (session) {
    return NextResponse.json({ authenticated: true, username: session.username, role: session.role });
  }

  return NextResponse.json({ authenticated: false }, { status: 401 });
}
