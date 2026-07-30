import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getUserByEmail, updateUser } from '@/lib/dbUsers';
import { readJson, writeJson } from '@/lib/dbLocal';
import { cookies } from 'next/headers';
import { encrypt } from '@/lib/session';
import { DEMO_SESSION_COOKIE } from '@/lib/auth';

const INITIAL_CASH = 100000000;

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: 'Email dan kode verifikasi wajib diisi' }, { status: 400 });
    }

    const user = await getUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'Email tidak ditemukan' }, { status: 404 });
    }

    if (user.is_verified) {
      return NextResponse.json({ error: 'Akun sudah terverifikasi' }, { status: 400 });
    }

    if (user.verification_code !== code) {
      return NextResponse.json({ error: 'Kode verifikasi salah' }, { status: 401 });
    }

    // Set trial for 7 days
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    user.is_verified = true;
    user.verification_code = null;
    user.trial_ends_at = trialEndsAt.toISOString();

    await updateUser(user.id, { is_verified: true, verification_code: null, trial_ends_at: user.trial_ends_at });

    // Create portfolio (still file/memory-backed - separate demo-account system, out of
    // scope for this migration; see project memory on /portfolio's own auth flow)
    const portfolios = readJson('data/portfolios.json') || [];
    if (!portfolios.find((p: any) => p.user_id === user.id)) {
      const newPortfolio = {
        id: `pf_${user.id}`,
        user_id: user.id,
        name: 'Portfolio Virtual',
        cash: INITIAL_CASH,
        initial_cash: INITIAL_CASH,
        created_at: new Date().toISOString()
      };
      portfolios.push(newPortfolio);
      writeJson('data/portfolios.json', portfolios);
    }

    // Create response first
    const response = NextResponse.json({ success: true, message: 'Verifikasi berhasil' });

    // Set JWT Session
    const session = await encrypt({
      id: user.id,
      email: user.email,
      role: user.role,
      is_pro: user.is_pro,
      trial_ends_at: user.trial_ends_at
    });
    response.cookies.set('session', session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60
    });

    // Set DEMO_SESSION_COOKIE for backward compatibility with portfolio API
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
