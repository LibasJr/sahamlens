import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSession } from '@/lib/session';

export async function POST(request: Request) {
  try {
    // telegram_id WAJIB berasal dari sesi terverifikasi, bukan dari body request -
    // sebelumnya klien bisa menulis ke watchlist siapa pun dengan menebak telegram_id (IDOR).
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }
    const telegram_id = Number(session.id) || null;

    const body = await request.json();
    const { watchlist } = body;

    if (!telegram_id || !watchlist || !Array.isArray(watchlist)) {
      return NextResponse.json({ error: 'watchlist array are required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('watchlists')
      .upsert(
        watchlist.map((item: any) => ({
          telegram_id,
          symbol: item.symbol,
          buy_price: item.buy_price,
          current_price: item.current_price,
          pnl_percent: item.pnl_percent,
          alert_price: item.alert_price
        })),
        { onConflict: 'telegram_id,symbol' }
      );

    if (error) throw error;

    return NextResponse.json({ success: true, message: `Migrated ${watchlist.length} items` });
  } catch (error) {
    console.error('Error migrating watchlist:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
