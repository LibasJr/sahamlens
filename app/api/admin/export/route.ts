import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';
import { isAdminFromRequestCookies } from '@/lib/auth';

export async function GET() {
  if (!isAdminFromRequestCookies(cookies())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const [users, watchlists, payments] = await Promise.all([
      supabaseAdmin.from('users').select('*'),
      supabaseAdmin.from('watchlists').select('*'),
      supabaseAdmin.from('payments').select('*'),
    ]);

    return NextResponse.json({
      success: true,
      users: users.data || [],
      watchlists: watchlists.data || [],
      payments: payments.data || [],
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
