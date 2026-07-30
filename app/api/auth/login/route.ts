import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/dbUsers';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { encrypt } from '@/lib/session';
import { DEMO_SESSION_COOKIE } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { email, password, remember } = await req.json();

    const user = await getUserByEmail(String(email || ''));

    if (!user) {
      return NextResponse.json({ error: 'Email atau password salah.' }, { status: 401 });
    }

    if (!user.is_verified && user.role !== 'admin') {
      return NextResponse.json({ error: 'Akun belum diverifikasi.' }, { status: 403 });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json({ error: 'Email atau password salah.' }, { status: 401 });
    }

    // Create response first
    const response = NextResponse.json({ success: true, role: user.role });

    const maxAge = remember ? 30 * 24 * 60 * 60 : 24 * 60 * 60; // 30 days or 1 day
    const sessionExpires = remember ? '30d' : '24h';

    // Set JWT Session
    const session = await encrypt({
      id: user.id,
      email: user.email,
      role: user.role,
      is_pro: user.is_pro,
      trial_ends_at: user.trial_ends_at
    }, sessionExpires);
    
    response.cookies.set('session', session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: maxAge
    });

    // Backward compatible with portfolio API
    response.cookies.set(DEMO_SESSION_COOKIE, JSON.stringify({ id: user.id, username: user.email, role: user.role }), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30
    });

    return response;

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
