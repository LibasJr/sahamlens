import {
  fetchYahooHistory,
  analyzeEma,
  analyzeRsi,
  analyzeMacd,
  analyzeVolume,
  analyzeTrend,
  analyzeVolatility,
  analyzeSupport,
  analyzeMarketFlow,
  analyzeSma,
  type OhlcRow,
} from '../../technical';
import { logger } from '../../../shared/logger/logger';
import { BACKTEST_UNIVERSE } from '../constants/backtest-universe';
import type {
  IndicatorName,
  Decision,
  DailyBar,
  TickerIndicatorSeries,
  BacktestIndicatorCache,
} from '../types/backtest.types';

// Buffer minimum hari perdagangan SEBELUM window keputusan mulai - MA Trend butuh
// 200 hari histori untuk MA200-nya sendiri (lihat modules/technical/service/analyzers/trend-analyzer.ts).
const LOOKBACK_DAYS = 200;
// Jendela histori yang diberikan ke tiap analyzer per hari (sejajar pola
// ANALYZER_HISTORY_DAYS di app/api/stock/[ticker]/route.ts - indikator standar tidak
// butuh ratusan tahun histori, cukup ~250 hari terakhir per titik waktu).
const ANALYZER_WINDOW = 250;
// Disimpan HANYA RETAIN_DAYS hari terakhir dari hasil precompute (bukan seluruh sisa
// setelah buffer) - cukup untuk periode backtest maksimal 24 bulan (~528 hari bursa)
// + margin, sekaligus membatasi ukuran payload Redis.
const RETAIN_DAYS = 560;

const INDICATOR_ANALYZERS: Record<IndicatorName, (history: any[], price: number) => { decision: string }> = {
  'EMA 20/50 Cross': analyzeEma,
  'Volume vs Avg 20D': analyzeVolume,
  'RSI 14': analyzeRsi,
  'MACD': analyzeMacd,
  'Volatility (ATR 14)': analyzeVolatility,
  'MA Trend IDX (20,50,200)': analyzeTrend,
  'Support & Resistance': analyzeSupport,
  'Market Flow Index': analyzeMarketFlow,
  'SMA Score (5,10,20)': analyzeSma,
};

const INDICATOR_NAMES = Object.keys(INDICATOR_ANALYZERS) as IndicatorName[];

function isValidDecision(d: string): d is Decision {
  return d === 'BULLISH' || d === 'BEARISH' || d === 'NEUTRAL';
}

function emptyDecisionMap(): Record<IndicatorName, Decision[]> {
  const map = {} as Record<IndicatorName, Decision[]>;
  INDICATOR_NAMES.forEach((name) => { map[name] = []; });
  return map;
}

// Diekspor untuk unit test - hitung deret keputusan harian 1 saham dari OHLCV mentah.
// null kalau data historis lebih pendek dari buffer lookback (saham baru IPO dsb).
export function computeTickerSeries(ticker: string, history: OhlcRow[]): TickerIndicatorSeries | null {
  if (history.length <= LOOKBACK_DAYS) return null;

  const bars: DailyBar[] = [];
  const decisions = emptyDecisionMap();

  for (let i = LOOKBACK_DAYS; i < history.length; i++) {
    const windowStart = Math.max(0, i - ANALYZER_WINDOW + 1);
    const windowHistory = history.slice(windowStart, i + 1);
    const currentPrice = history[i].Close;

    bars.push({ date: history[i].Date.split('T')[0], close: currentPrice, open: history[i].Open });

    INDICATOR_NAMES.forEach((name) => {
      const result = INDICATOR_ANALYZERS[name](windowHistory, currentPrice);
      decisions[name].push(isValidDecision(result.decision) ? (result.decision as Decision) : 'NEUTRAL');
    });
  }

  const trimmedBars = bars.slice(-RETAIN_DAYS);
  const trimmedDecisions = emptyDecisionMap();
  INDICATOR_NAMES.forEach((name) => {
    trimmedDecisions[name] = decisions[name].slice(-RETAIN_DAYS);
  });

  return { ticker, bars: trimmedBars, decisions: trimmedDecisions };
}

async function fetchTickerSeries(ticker: string): Promise<TickerIndicatorSeries | null> {
  const result = await fetchYahooHistory(ticker, '5y');
  if (!result) {
    // fetch gagal - saham ini di-skip, tidak melempar error (spec: satu saham gagal
    // tidak boleh menggagalkan seluruh precompute harian) - tapi dicatat di log.
    logger.warn('Backtest precompute: gagal fetch histori', { ticker });
    return null;
  }
  return computeTickerSeries(ticker, result.history);
}

// Entry point dipanggil cron (app/api/cron/backtest-precompute) dan fallback sinkron
// di /api/backtest saat cache-miss. Proses per-batch (bukan 100 fetch sekaligus)
// supaya tidak membebani Yahoo Finance terlalu berat dalam satu ledakan request.
export async function precomputeBacktestData(): Promise<BacktestIndicatorCache> {
  const BATCH_SIZE = 15;
  const tickers: TickerIndicatorSeries[] = [];

  for (let i = 0; i < BACKTEST_UNIVERSE.length; i += BATCH_SIZE) {
    const batch = BACKTEST_UNIVERSE.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(fetchTickerSeries));
    for (const r of batchResults) {
      if (r) tickers.push(r);
    }
  }

  const ihsgResult = await fetchYahooHistory('^JKSE', '5y');
  const ihsg: DailyBar[] = ihsgResult
    ? ihsgResult.history.slice(LOOKBACK_DAYS).slice(-RETAIN_DAYS).map((h) => ({ date: h.Date.split('T')[0], close: h.Close, open: h.Open }))
    : [];

  return { computedAt: new Date().toISOString(), ihsg, tickers };
}
