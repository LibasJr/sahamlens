import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Helper function to send telegram message
async function sendTelegramMessage(telegram_id: number, message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegram_id,
        text: message,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    console.error('Failed to send telegram message', err);
  }
}

async function fetchJson(url: string) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function getPrice(data: any): number {
  return Number(data?.stock?.current_price ?? data?.price ?? 0);
}

function getRsi(data: any): number | null {
  const rsiAnalyzer = data?.analyzers?.find((a: any) => a.label.includes('RSI'));
  const match = rsiAnalyzer?.value?.match(/RSI:\s*([\d.]+)/);
  return match ? Number(match[1]) : null;
}

function isTriggered(alert: any, ctx: { stock?: any; breakoutEntry?: any; breadth?: any }): boolean {
  const target = Number(alert.condition_value);
  switch (alert.condition_type) {
    case 'PRICE_BELOW':
      return getPrice(ctx.stock) <= target;
    case 'PRICE_ABOVE':
      return getPrice(ctx.stock) >= target;
    case 'CONSENSUS_STRONG_BUY':
      return ctx.stock?.consensusData?.kategori === 'STRONG BUY';
    case 'RSI_OVERSOLD': {
      const rsi = getRsi(ctx.stock);
      return rsi !== null && rsi < 30;
    }
    case 'BREAKOUT_SCORE_ABOVE':
      return typeof ctx.breakoutEntry?.score === 'number' && ctx.breakoutEntry.score >= target;
    case 'BREADTH_ADVANCING_BELOW':
      return typeof ctx.breadth?.advancing === 'number' && ctx.breadth.advancing < target;
    default:
      return false;
  }
}

function formatMessage(alert: any, ctx: { stock?: any; breakoutEntry?: any; breadth?: any }): string {
  switch (alert.condition_type) {
    case 'PRICE_BELOW':
    case 'PRICE_ABOVE':
    case 'CONSENSUS_STRONG_BUY':
    case 'RSI_OVERSOLD': {
      const price = getPrice(ctx.stock);
      const label = alert.condition_type === 'PRICE_BELOW' ? `Harga turun ke bawah ${alert.condition_value}`
        : alert.condition_type === 'PRICE_ABOVE' ? `Harga naik ke atas ${alert.condition_value}`
        : alert.condition_type === 'CONSENSUS_STRONG_BUY' ? 'Konsensus STRONG BUY'
        : 'RSI Oversold (< 30)';
      const score = ctx.stock?.scoring?.total_score;
      const kategori = ctx.stock?.scoring?.kategori;
      return [
        '🚨 <b>ALERT SahamLens</b>',
        `${alert.symbol} ${label}!`,
        `Price: ${price.toLocaleString('id-ID')}${score != null ? ` | Score: ${score} ${kategori || ''}` : ''}`,
        `Cek: /dashboard?symbol=${alert.symbol}`,
      ].join('\n');
    }
    case 'BREAKOUT_SCORE_ABOVE': {
      const e = ctx.breakoutEntry;
      return [
        '🚨 <b>ALERT SahamLens - Breakout Radar</b>',
        `${alert.symbol} Score ${e?.score}/8 (target >= ${alert.condition_value})!`,
        `Price: ${e?.price?.toLocaleString?.('id-ID') ?? e?.price} | Change: ${e?.change} | RR: ${e?.rr}`,
        `Sinyal: ${e?.reason || '-'}`,
        `Cek: /breakout-radar`,
      ].join('\n');
    }
    case 'BREADTH_ADVANCING_BELOW': {
      const b = ctx.breadth;
      return [
        '🚨 <b>ALERT SahamLens - Market Breadth</b>',
        `Breadth IDX bearish: ${b?.advancing} saham naik vs ${b?.declining} turun (target advancing < ${alert.condition_value}).`,
        `Cek: /market-pulse`,
      ].join('\n');
    }
    default:
      return `🚨 ALERT SahamLens: ${alert.symbol} (${alert.condition_type})`;
  }
}

const STOCK_BASED_TYPES = ['PRICE_BELOW', 'PRICE_ABOVE', 'CONSENSUS_STRONG_BUY', 'RSI_OVERSOLD'];

export async function GET(req: Request) {
  try {
    const { data: active, error } = await supabaseAdmin
      .from('alerts')
      .select('*')
      .eq('triggered', false);

    if (error) throw error;
    if (!active || active.length === 0) {
      return NextResponse.json({ checked: 0, triggered: 0 });
    }

    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const origin = `${protocol}://${host}`;

    // Alert berbasis saham (fetch /api/stock/[symbol], di-batch per simbol unik)
    const stockSymbols = Array.from(new Set<string>(active.filter((a: any) => STOCK_BASED_TYPES.includes(a.condition_type)).map((a: any) => a.symbol)));
    const stockBySymbol = new Map<string, any>();
    for (const symbol of stockSymbols) {
      const data = await fetchJson(`${origin}/api/stock/${symbol}`);
      if (data) stockBySymbol.set(symbol, data);
    }

    // Alert breakout radar
    const hasBreakoutAlert = active.some((a: any) => a.condition_type === 'BREAKOUT_SCORE_ABOVE');
    const breakoutData = hasBreakoutAlert ? await fetchJson(`${origin}/api/breakout-radar`) : null;
    const breakoutBySymbol = new Map<string, any>((breakoutData?.data || []).map((e: any) => [e.symbol.replace('.JK', ''), e]));

    // Alert breadth
    const hasBreadthAlert = active.some((a: any) => a.condition_type === 'BREADTH_ADVANCING_BELOW');
    const pulseData = hasBreadthAlert ? await fetchJson(`${origin}/api/market-pulse`) : null;

    let triggeredCount = 0;
    
    for (const alert of active) {
      const ctx = {
        stock: stockBySymbol.get(alert.symbol),
        breakoutEntry: breakoutBySymbol.get(alert.symbol.replace('.JK', '')),
        breadth: pulseData?.breadth,
      };

      const hasData = STOCK_BASED_TYPES.includes(alert.condition_type) ? !!ctx.stock
        : alert.condition_type === 'BREAKOUT_SCORE_ABOVE' ? !!ctx.breakoutEntry
        : alert.condition_type === 'BREADTH_ADVANCING_BELOW' ? !!ctx.breadth
        : false;
        
      if (!hasData) continue;

      if (isTriggered(alert, ctx)) {
        await sendTelegramMessage(alert.telegram_id, formatMessage(alert, ctx));
        
        await supabaseAdmin
          .from('alerts')
          .update({ triggered: true })
          .eq('id', alert.id);
          
        triggeredCount++;
      }
    }

    return NextResponse.json({ checked: active.length, triggered: triggeredCount });
  } catch (err) {
    console.error('Error checking alerts:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
