import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSession } from '@/lib/session';

async function getTelegramId() {
  const session = await getSession();
  if (session) {
    if (session.role === 'admin') return 999999;
    return Number(session.userId) || 12345;
  }
  return null;
}

export async function GET(request: Request) {
  const telegram_id = await getTelegramId();

  if (!telegram_id) {
    return NextResponse.json({ error: 'telegram_id is required' }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('watchlists')
      .select('*')
      .eq('telegram_id', telegram_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const telegram_id = await getTelegramId();
    if (!telegram_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { symbol, buy_price, current_price, pnl_percent, alert_price, lot } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'telegram_id and symbol are required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('watchlists')
      .upsert({
        telegram_id,
        symbol,
        buy_price,
        current_price,
        pnl_percent,
        alert_price,
        lot
      }, { onConflict: 'telegram_id,symbol' })
      .select();

    if (error) throw error;
    
    // Log usage
    await supabaseAdmin.from('usage_logs').insert({
      telegram_id,
      symbol,
      action: 'watchlist_add'
    });

    return NextResponse.json(data[0] || { success: true });
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const telegram_id = await getTelegramId();
  const symbol = searchParams.get('symbol');

  if (!telegram_id || !symbol) {
    return NextResponse.json({ error: 'telegram_id and symbol are required' }, { status: 400 });
  }

  try {
    const { error } = await supabaseAdmin
      .from('watchlists')
      .delete()
      .match({ telegram_id, symbol });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting from watchlist:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
