import {
  readBacktestCache,
  precomputeBacktestData,
  writeBacktestCache,
  simulateBacktest,
  calculateBacktestSignificance,
  type IndicatorName,
  type BacktestIndicatorCache,
} from '@/modules/backtest';
import { BACKTEST_PERIOD_MONTHS } from '@/modules/backtest/constants/backtest-periods';
import { BACKTEST_UNIVERSE_VERSION } from '@/modules/backtest/constants/backtest-universe';
import {
  BACKTEST_DATA_SNAPSHOT_VERSION,
  BACKTEST_MODEL_VERSION,
} from '@/modules/backtest/constants/model-version';
import { researchOutputProvenance } from '@/shared/research/provenance';

export const VALID_BACKTEST_FILTERS: IndicatorName[] = [
  'EMA 20/50 Cross',
  'Volume vs Avg 20D',
  'RSI 14',
  'MACD',
  'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)',
  'Support & Resistance',
  'Market Flow Index',
  'SMA Score (5,10,20)',
];

const VALID_BACKTEST_PERIODS: readonly number[] = BACKTEST_PERIOD_MONTHS;
const MAX_TRADES_IN_RESPONSE = 30;

function fmtPct(n: number): string {
  const formatted = n.toFixed(2).replace(/\.?0+$/, '');
  return `${n >= 0 ? '+' : ''}${formatted}%`;
}

async function getCache(existing?: BacktestIndicatorCache | null): Promise<BacktestIndicatorCache> {
  let cache = existing ?? await readBacktestCache();
  if (!cache) {
    cache = await precomputeBacktestData();
    await writeBacktestCache(cache);
  }
  return cache;
}

export type BacktestRunResult =
  | { ok: false; status: number; body: Record<string, unknown> }
  | { ok: true; body: Record<string, unknown> };

export async function runBacktestSimulation(
  rawBody: unknown,
  options: { cachedBacktest?: BacktestIndicatorCache | null; isGuest: boolean },
): Promise<BacktestRunResult> {
  const body = rawBody as any;
  const rawFilters: unknown[] = Array.isArray(body?.filters) ? body.filters : [];
  const hasUnknownFilter = rawFilters.some(
    (filter): boolean => !(typeof filter === 'string' && VALID_BACKTEST_FILTERS.includes(filter as IndicatorName)),
  );
  if (hasUnknownFilter) return { ok: false, status: 400, body: { error: 'Filter tidak dikenal' } };

  const filters = rawFilters as IndicatorName[];
  if (filters.length === 0) return { ok: false, status: 400, body: { error: 'Pilih minimal 1 filter' } };

  const modal = Number(body?.modal);
  const period = Number(body?.period);
  if (!Number.isFinite(modal) || modal <= 0) {
    return { ok: false, status: 400, body: { error: 'Modal awal harus lebih dari 0' } };
  }
  if (!VALID_BACKTEST_PERIODS.includes(period)) {
    return { ok: false, status: 400, body: { error: 'Periode tidak valid' } };
  }

  const cache = await getCache(options.cachedBacktest);
  let result;
  try {
    result = simulateBacktest(cache, { filters, modal, periodMonths: period });
  } catch (error) {
    if (error instanceof Error && error.message === 'BACKTEST_BENCHMARK_UNAVAILABLE') {
      return {
        ok: false,
        status: 503,
        body: { error: 'Data benchmark IHSG tidak tersedia untuk periode ini. Backtest tidak dihitung agar alpha tidak difabrikasi.' },
      };
    }
    throw error;
  }

  const visibleTrades = options.isGuest
    ? result.trades.slice(0, 2)
    : result.trades.slice(0, MAX_TRADES_IN_RESPONSE);
  const tradesLockedCount = options.isGuest ? Math.max(0, result.totalTrades - 2) : 0;

  // Signifikansi dihitung dari SELURUH trade (result.trades), bukan visibleTrades yang
  // sudah dipotong untuk tampilan/guest-limit - memotong dulu baru menguji akan membuang
  // sampel dan bisa menaikkan/menurunkan p-value tanpa alasan statistik apa pun.
  const significance = calculateBacktestSignificance(result.trades);

  const responseBody: Record<string, unknown> = {
    return: fmtPct(result.returnPct),
    ihsgReturn: fmtPct(result.ihsgReturnPct),
    alpha: fmtPct(result.alphaPct),
    winRate: `${result.winRatePct.toFixed(0)}%`,
    totalTrades: result.totalTrades,
    maxDD: fmtPct(result.maxDrawdownPct),
    performance: result.performance,
    significance,
    universe: result.universe,
    equityCurve: result.equityCurve,
    ihsgCurve: result.ihsgCurve,
    trades: visibleTrades.map((trade) => ({
      date: trade.date,
      symbol: trade.symbol,
      buy: Math.round(trade.buy),
      pnl: fmtPct(trade.pnlPct),
    })),
    trades_locked_count: tradesLockedCount,
    is_guest_limited: options.isGuest,
    dataAsOf: result.computedAt,
    provenance: researchOutputProvenance({
      source: 'Yahoo Finance historical OHLCV via backtest indicator cache',
      period: `${period} bulan; jendela aktual mengikuti hari bursa yang tersedia`,
      dataMode: 'POINT_IN_TIME',
      asOf: result.computedAt,
      retrievedAt: new Date().toISOString(),
      confidence: 'calculated',
      isEstimated: false,
      modelVersion: BACKTEST_MODEL_VERSION,
      universeVersion: BACKTEST_UNIVERSE_VERSION,
      dataSnapshotVersion: BACKTEST_DATA_SNAPSHOT_VERSION,
      transformation: 'Sinyal teknikal point-in-time; eksekusi paling cepat open H+1; hasil dibandingkan dengan IHSG.',
      note: 'Keluaran riset historis, bukan prediksi atau rekomendasi investasi.',
    }),
  };

  if (result.totalTrades === 0) {
    responseBody.message = 'Tidak ada saham yang memenuhi kriteria filter ini dalam periode terpilih.';
  }

  return { ok: true, body: responseBody };
}
