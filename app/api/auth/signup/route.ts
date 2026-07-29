import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { readJson, writeJson } from '@/lib/dbLocal';
import { cookies } from 'next/headers';
import { hashPassword, DEMO_SESSION_COOKIE } from '@/lib/auth';

const INITIAL_CASH = 100000000;

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Username dan password wajib diisi' }, { status: 400 });
    }
    if (username.trim().length < 3) {
      return NextResponse.json({ error: 'Username minimal 3 karakter' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 });
    }

    const users = readJson('data/users.json') || [];
    if (users.some((u: any) => u.username.toLowerCase() === username.trim().toLowerCase())) {
      return NextResponse.json({ error: 'Username sudah dipakai' }, { status: 409 });
    }

    const newUser = {
      id: Date.now(),
      username: username.trim(),
      passwordHash: hashPassword(password),
      role: 'free' as const,
      created_at: new Date().toISOString()
    };
    users.push(newUser);
    writeJson('data/users.json', users);

    // Setiap akun baru dapat portfolio virtual sendiri, mulai kosong (tanpa transaksi bawaan).
    const portfolios = readJson('data/portfolios.json') || [];
    const newPortfolio = {
      id: `pf_${newUser.id}`,
      user_id: newUser.id,
      name: 'Portfolio Virtual',
      cash: INITIAL_CASH,
      initial_cash: INITIAL_CASH,
      created_at: new Date().toISOString()
    };
    portfolios.push(newPortfolio);
    writeJson('data/portfolios.json', portfolios);

    const cookieStore = cookies();
    cookieStore.set(DEMO_SESSION_COOKIE, JSON.stringify({ id: newUser.id, username: newUser.username, role: newUser.role }), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30
    });

    return NextResponse.json({ success: true, role: newUser.role });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
