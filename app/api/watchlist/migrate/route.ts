import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { telegram_id, watchlist } = body;

    if (!telegram_id || !watchlist || !Array.isArray(watchlist)) {
      return NextResponse.json({ error: 'telegram_id and watchlist array are required' }, { status: 400 });
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
