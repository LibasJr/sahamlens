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
      .from('alerts')
      .select('*')
      .eq('telegram_id', telegram_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ alerts: data });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const telegram_id = await getTelegramId();
    if (!telegram_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { symbol, conditionType, targetValue } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'telegram_id and symbol are required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('alerts')
      .insert({
        telegram_id,
        symbol,
        condition_type: conditionType,
        condition_value: targetValue,
        triggered: false
      })
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, alert: data[0] });
  } catch (error) {
    console.error('Error creating alert:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const telegram_id = await getTelegramId();

  if (!id || !telegram_id) {
    return NextResponse.json({ error: 'id and telegram_id are required' }, { status: 400 });
  }

  try {
    const { error } = await supabaseAdmin
      .from('alerts')
      .delete()
      .match({ id, telegram_id });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting alert:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
