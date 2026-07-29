import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
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
