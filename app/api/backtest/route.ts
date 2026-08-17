import { guard } from '../../../lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, hasOpenOrProAccess } from '../../../modules/user';
import { logger } from '../../../shared/logger/logger';
import { computeActorFromRequest, consumeComputeBudget } from '../../../shared/middleware/compute-budget';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '../../../shared/auth/anonymous-trial';
import {
  readBacktestCache,
  precomputeBacktestData,
  writeBacktestCache,
  simulateBacktest,
  type IndicatorName,
  type BacktestIndicatorCache,
} from '../../../modules/backtest';
import { BACKTEST_PERIOD_MONTHS } from '../../../modules/backtest/constants/backtest-periods';

export const maxDuration = 60;

const VALID_FILTERS: IndicatorName[] = [
  'EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14', 'MACD', 'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)', 'Support & Resistance', 'Market Flow Index', 'SMA Score (5,10,20)',
];
// Daftar periode TIDAK lagi ditulis di sini - satu sumber di
// modules/backtest/constants/backtest-periods.ts, yang juga dipakai UI dan diikat ke
// RETAIN_DAYS precompute lewat test invarian. Menambah periode tanpa menaikkan retensi
// tidak menghasilkan error, melainkan backtest kosong tanpa penjelasan.
const VALID_PERIODS: readonly number[] = BACKTEST_PERIOD_MONTHS;
const MAX_TRADES_IN_RESPONSE = 30;

// Mode 'live-signal' dihapus 2026-08-03 bersama tab "Sinyal Hari Ini" di UI - pertanyaan
// "saham mana yang menarik hari ini" sekarang dijawab /api/ai-pick dengan peringkat skor
// komposit, tanpa pengguna perlu menyusun kombinasi filter sendiri. Endpoint ini kembali
// mengerjakan satu hal saja: simulasi historis.

function fmtPct(n: number): string {
  const formatted = n.toFixed(2).replace(/\.?0+$/, '');
  return `${n >= 0 ? '+' : ''}${formatted}%`;
}

async function getCache(existing?: BacktestIndicatorCache | null): Promise<BacktestIndicatorCache> {
  let cache = existing ?? await readBacktestCache();
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
    // Cookie trial anonim TETAP diterbitkan (dipakai identitas kuota chat guest &
    // telemetri), tapi TIDAK LAGI dipakai untuk gerbang akses fitur ini - keputusan
    // produk 2026-08-13, lihat hasOpenOrProAccess().
    let anonTrial: AnonTrialState | null = null;
    if (!session) anonTrial = await readOrIssueAnonymousTrial();

    if (!(await hasOpenOrProAccess(session))) {
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    // BARU (2026-08-14): dulu tamu dipaksa tier 'public' (40/10 menit) sementara user
    // login dapat 'authenticated' (160/10 menit) - HANYA berdasarkan ada/tidaknya sesi,
    // bukan status Pro. Itu bertentangan dengan keputusan produk "rule tamu = rule user
    // yang sudah login": hasOpenOrProAccess() di atas sudah meloloskan tamu, tapi lalu
    // dijegal lagi di sini oleh anggaran komputasi yang lebih kecil dan actor `ip:xxx`
    // yang dibagi SEMUA tamu di Wi-Fi/CGNAT yang sama - persis error "Terlalu banyak
    // request" yang dilaporkan. Guard ini murni anti-abuse (lihat komentar
    // consumeComputeBudget), bukan gerbang produk, jadi disamakan untuk semua yang lolos
    // gerbang di atas; actor tamu dibedakan per-identitas trial anonim, bukan per-IP.
    const cachedBacktest = await readBacktestCache();
    const actor = session?.id
      ? computeActorFromRequest(request, session.id)
      : anonTrial
        ? `guest:${anonTrial.firstSeenAt}`
        : computeActorFromRequest(request);
    const budget = await consumeComputeBudget(
      actor,
      cachedBacktest ? 2 : 10,
      'authenticated',
    );
    if (!budget.allowed) {
      return NextResponse.json(
        { error: 'Terlalu banyak komputasi berat dalam waktu singkat. Coba lagi sebentar.', code: 'COMPUTE_BUDGET_EXCEEDED' },
        { status: 429, headers: budget.retryAfterSec ? { 'Retry-After': String(budget.retryAfterSec) } : undefined },
      );
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

    const cache = await getCache(cachedBacktest);
    let result;
    try {
      result = simulateBacktest(cache, { filters, modal, periodMonths: period });
    } catch (error) {
      if (error instanceof Error && error.message === 'BACKTEST_BENCHMARK_UNAVAILABLE') {
        return NextResponse.json(
          { error: 'Data benchmark IHSG tidak tersedia untuk periode ini. Backtest tidak dihitung agar alpha tidak difabrikasi.' },
          { status: 503 },
        );
      }
      throw error;
    }

    const isGuest = !session || typeof session.id !== 'string';
    const visibleTrades = isGuest ? result.trades.slice(0, 2) : result.trades.slice(0, MAX_TRADES_IN_RESPONSE);
    const tradesLockedCount = isGuest ? Math.max(0, result.totalTrades - 2) : 0;

    const responseBody: Record<string, unknown> = {
      return: fmtPct(result.returnPct),
      ihsgReturn: fmtPct(result.ihsgReturnPct),
      alpha: fmtPct(result.alphaPct),
      winRate: `${result.winRatePct.toFixed(0)}%`,
      totalTrades: result.totalTrades,
      maxDD: fmtPct(result.maxDrawdownPct),
      // Temuan H-05: return dan drawdown saja tidak menyatakan berapa risiko yang
      // ditanggung untuk mendapatkannya. Dikirim mentah (null tetap null) supaya UI yang
      // memutuskan cara merendernya, bukan diformat jadi "0" yang menyamar sebagai hasil.
      performance: result.performance,
      // Berapa emiten yang gugur karena histori kurang panjang. Wajib dikirim: penyaringnya
      // memperkuat survivorship bias sebanding dengan panjang periode, dan tanpa angka ini
      // penyusutan universe tidak terlihat sama sekali di layar.
      universe: result.universe,
      equityCurve: result.equityCurve,
      ihsgCurve: result.ihsgCurve,
      trades: visibleTrades.map((t) => ({
        date: t.date,
        symbol: t.symbol,
        buy: Math.round(t.buy),
        pnl: fmtPct(t.pnlPct),
      })),
      trades_locked_count: tradesLockedCount,
      is_guest_limited: isGuest,
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
