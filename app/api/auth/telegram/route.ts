import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE } from '@/lib/constants';
import { USER_COOKIE, verifyTelegramAuth, getAdminTelegramIds } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => { params[key] = value; });

  const host = req.headers.get('host') || req.nextUrl.host;
  const protocol = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '');
  const origin = `${protocol}://${host}`;

  if (!params.hash || !params.id || !verifyTelegramAuth(params)) {
    return NextResponse.redirect(new URL('/admin-login?error=invalid', origin));
  }

  const telegram_id = Number(params.id);
  const isAdmin = getAdminTelegramIds().includes(String(params.id));
  const defaultRole = isAdmin ? 'admin' : 'free';
  const defaultSisa = isAdmin ? 999 : 5;

  // Insert/Update to Supabase
  try {
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id)
      .single();

    if (!existingUser) {
      await supabaseAdmin.from('users').insert({
        telegram_id,
        username: params.username || null,
        first_name: params.first_name || null,
        role: defaultRole,
        sisa_analisa: defaultSisa,
        last_reset: new Date().toISOString().split('T')[0]
      });
    } else {
      // Just update name/username if changed, don't reset role or sisa_analisa unless needed
      if (isAdmin && existingUser.role !== 'admin') {
         await supabaseAdmin.from('users').update({
            role: 'admin',
            sisa_analisa: 999
         }).eq('telegram_id', telegram_id);
      } else {
         await supabaseAdmin.from('users').update({
            username: params.username || existingUser.username,
            first_name: params.first_name || existingUser.first_name,
         }).eq('telegram_id', telegram_id);
      }
    }
  } catch (err) {
    console.error("Error upserting user to Supabase", err);
  }

  const res = NextResponse.redirect(new URL('/dashboard', origin));
  res.cookies.set(USER_COOKIE, JSON.stringify({
    id: params.id,
    name: params.first_name || params.username || 'User',
    username: params.username || null,
  }), {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  if (isAdmin) {
    res.cookies.set(ADMIN_COOKIE, ADMIN_COOKIE_VALUE, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    // Sama seperti admin-login/key: /api/stock, /api/council, dan badge client (hasProAccess)
    // cek cookie "saham_admin"/"role" ini, bukan ADMIN_COOKIE - dua skema gak saling kenal.
    res.cookies.set('saham_admin', 'true', {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    res.cookies.set('role', 'admin', {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return res;
}
