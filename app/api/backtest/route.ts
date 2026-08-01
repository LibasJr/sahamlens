import { guard } from '../../../lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession } from '../../../modules/user';
import {
  readBacktestCache,
  precomputeBacktestData,
  simulateBacktest,
  type IndicatorName,
} from '../../../modules/backtest';

const VALID_FILTERS: IndicatorName[] = [
  'EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14', 'MACD', 'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)', 'Support & Resistance', 'Market Flow Index', 'SMA Score (5,10,20)',
];
const VALID_PERIODS = [3, 6, 12, 24];
const MAX_TRADES_IN_RESPONSE = 30;

function fmtPct(n: number): string {
  const formatted = n.toFixed(2).replace(/\.?0+$/, '');
  return `${n >= 0 ? '+' : ''}${formatted}%`;
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }

    const body = await request.json();
    const filters: IndicatorName[] = Array.isArray(body?.filters)
      ? body.filters.filter((f: unknown): f is IndicatorName => VALID_FILTERS.includes(f as IndicatorName))
      : [];
    const modal = Number(body?.modal);
    const period = Number(body?.period);

    if (filters.length === 0) {
      return NextResponse.json({ error: 'Pilih minimal 1 filter' }, { status: 400 });
    }
    if (!Number.isFinite(modal) || modal <= 0) {
      return NextResponse.json({ error: 'Modal awal harus lebih dari 0' }, { status: 400 });
    }
    if (!VALID_PERIODS.includes(period)) {
      return NextResponse.json({ error: 'Periode tidak valid' }, { status: 400 });
    }

    let cache = await readBacktestCache();
    if (!cache) {
      // Cron belum pernah jalan / cache kadaluarsa - hitung langsung (lambat, tapi
      // tetap data asli, bukan gagal). Pola sama seperti market-pulse/breakout-radar.
      cache = await precomputeBacktestData();
    }

    const result = simulateBacktest(cache, { filters, modal, periodMonths: period });

    const responseBody: Record<string, unknown> = {
      return: fmtPct(result.returnPct),
      ihsgReturn: fmtPct(result.ihsgReturnPct),
      alpha: fmtPct(result.alphaPct),
      winRate: `${result.winRatePct.toFixed(0)}%`,
      totalTrades: result.totalTrades,
      maxDD: fmtPct(result.maxDrawdownPct),
      equityCurve: result.equityCurve,
      ihsgCurve: result.ihsgCurve,
      trades: result.trades.slice(0, MAX_TRADES_IN_RESPONSE).map((t) => ({
        date: t.date,
        symbol: t.symbol,
        buy: Math.round(t.buy),
        pnl: fmtPct(t.pnlPct),
      })),
      dataAsOf: result.computedAt,
    };

    if (result.totalTrades === 0) {
      responseBody.message = 'Tidak ada saham yang memenuhi kriteria filter ini dalam periode terpilih.';
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
