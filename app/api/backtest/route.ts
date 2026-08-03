import { guard } from '../../../lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccessLive } from '../../../modules/user';
import { logger } from '../../../shared/logger/logger';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '../../../shared/auth/anonymous-trial';
import {
  readBacktestCache,
  precomputeBacktestData,
  writeBacktestCache,
  simulateBacktest,
  type IndicatorName,
  type BacktestIndicatorCache,
} from '../../../modules/backtest';

export const maxDuration = 60;

const VALID_FILTERS: IndicatorName[] = [
  'EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14', 'MACD', 'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)', 'Support & Resistance', 'Market Flow Index', 'SMA Score (5,10,20)',
];
const VALID_PERIODS = [3, 6, 12, 24];
const MAX_TRADES_IN_RESPONSE = 30;

// Mode 'live-signal' dihapus 2026-08-03 bersama tab "Sinyal Hari Ini" di UI - pertanyaan
// "saham mana yang menarik hari ini" sekarang dijawab /api/ai-pick dengan peringkat skor
// komposit, tanpa pengguna perlu menyusun kombinasi filter sendiri. Endpoint ini kembali
// mengerjakan satu hal saja: simulasi historis.

function fmtPct(n: number): string {
  const formatted = n.toFixed(2).replace(/\.?0+$/, '');
  return `${n >= 0 ? '+' : ''}${formatted}%`;
}

async function getCache(): Promise<BacktestIndicatorCache> {
  let cache = await readBacktestCache();
  if (!cache) {
    // Cron belum pernah jalan / cache kadaluarsa - hitung langsung (lambat, tapi
    // tetap data asli, bukan gagal). Pola sama seperti market-pulse/breakout-radar.
    cache = await precomputeBacktestData();
    // Simpan hasilnya supaya request cache-miss berikutnya tidak ikut menghitung ulang
    // seluruh universe dari nol (tanpa distributed lock/stampede protection - di luar
    // scope fix ini, lihat catatan review).
    await writeBacktestCache(cache);
  }
  return cache;
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    let anonTrial: AnonTrialState | null = null;
    if (!session) {
      anonTrial = await readOrIssueAnonymousTrial();
      if (!anonTrial.active) {
        return NextResponse.json({ error: 'Belum login' }, { status: 401 });
      }
    }

    // Dulu tidak ada gerbang Pro sama sekali di sini - akun gratis terdaftar (bukan
    // trial) dapat Backtest unlimited selamanya, beda dari Market Pulse/Compare/Council
    // yang tetap minta Pro setelah trial habis. Disamakan (lihat app/api/market-pulse/route.ts).
    const hasPro = anonTrial?.active === true || (await checkProAccessLive(session));
    if (!hasPro) {
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const body = await request.json();

    const rawFilters: unknown[] = Array.isArray(body?.filters) ? body.filters : [];
    const hasUnknownFilter = rawFilters.some(
      (f): boolean => !(typeof f === 'string' && VALID_FILTERS.includes(f as IndicatorName))
    );
    if (hasUnknownFilter) {
      return NextResponse.json({ error: 'Filter tidak dikenal' }, { status: 400 });
    }
    const filters = rawFilters as IndicatorName[];
    if (filters.length === 0) {
      return NextResponse.json({ error: 'Pilih minimal 1 filter' }, { status: 400 });
    }

    const modal = Number(body?.modal);
    const period = Number(body?.period);
    if (!Number.isFinite(modal) || modal <= 0) {
      return NextResponse.json({ error: 'Modal awal harus lebih dari 0' }, { status: 400 });
    }
    if (!VALID_PERIODS.includes(period)) {
      return NextResponse.json({ error: 'Periode tidak valid' }, { status: 400 });
    }

    const cache = await getCache();
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

    const response = NextResponse.json(responseBody);
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error) {
    logger.error('Backtest gagal', { error });
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
