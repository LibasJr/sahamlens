import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/dbLocal';
import { cookies } from 'next/headers';
import { verifyPassword, DEMO_SESSION_COOKIE } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    const users = readJson('data/users.json') || [];
    const user = users.find((u: any) => u.username.toLowerCase() === String(username || '').trim().toLowerCase());

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Username atau password salah. Belum punya akun? Daftar dulu.' }, { status: 401 });
    }

    // Sengaja TIDAK pernah set cookie 'saham_admin'/'role' di sini - itu jalur admin situs
    // (lihat lib/auth.ts). Login akun demo cuma buka akses ke portfolio virtual miliknya sendiri.
    const cookieStore = cookies();
    cookieStore.set(DEMO_SESSION_COOKIE, JSON.stringify({ id: user.id, username: user.username, role: user.role }), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30
    });

    return NextResponse.json({ success: true, role: user.role });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
