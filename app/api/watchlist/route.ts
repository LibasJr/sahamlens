import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cookies } from 'next/headers';
import { USER_COOKIE } from '@/lib/auth';

function getTelegramId() {
  const cookieStore = cookies();
  const isAdmin = cookieStore.get('saham_admin')?.value === 'true' || 
                  cookieStore.get('role')?.value === 'admin' || 
                  cookieStore.get('role')?.value === 'pro';
  if (isAdmin) return 999999;
  
  const userCookie = cookieStore.get(USER_COOKIE);
  if (userCookie?.value) {
    try {
      const parsed = JSON.parse(decodeURIComponent(userCookie.value));
      return Number(parsed.id);
    } catch (e) {}
  }
  return null;
}

export async function GET(request: Request) {
  const telegram_id = getTelegramId();

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
    const telegram_id = getTelegramId();
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
  const telegram_id = getTelegramId();
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
