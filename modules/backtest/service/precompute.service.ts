import {
  fetchYahooHistoryDirect,
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
// setelah buffer) - sekaligus membatasi ukuran payload Redis.
//
// DIPERPANJANG 2026-08-12 dari 560 (cukup untuk 24 bulan) ke 1340: periode backtest
// terpanjang kini 60 bulan, dan simulateBacktest memotong jendelanya sebagai
// periodMonths x 22 = 1.320 bar. 20 bar sisanya adalah margin.
//
// CATATAN SATUAN: 22 hari bursa/bulan adalah aproksimasi. IDX sesungguhnya ~241 hari
// bursa setahun (diukur dari ^JKSE, bukan diasumsikan), jadi "60 bulan" memotong 1.320
// bar = ~5,5 tahun kalender, bukan tepat 5. Angka tahun yang SEBENARNYA dilaporkan
// apa adanya di `performance.years` (modules/backtest/service/performance-metrics.ts),
// yang menghitungnya dari rentang tanggal, bukan dari aproksimasi ini.
// BIAYA PENYIMPANAN, diukur bukan diperkirakan (2026-08-12): satu deret ticker pada 1.340
// hari berukuran ~215 KB JSON, jadi 109 emiten = ~23 MB di Redis (sebelumnya ~9,6 MB pada
// 560 hari). Masih jauh di bawah batas 1 MB per key Upstash, tetapi ini kenaikan 2,4x pada
// kuota penyimpanan - dinyatakan di sini supaya keputusan memperpanjang periode dan
// biayanya terbaca di tempat yang sama.
export const RETAIN_DAYS = 1340;

// Rentang yang diminta ke Yahoo. Diukur 2026-08-12: '5y' mengembalikan 1.206 bar untuk
// emiten IDX - setelah dikurangi LOOKBACK_DAYS hanya tersisa ~1.006 hari keputusan, TIDAK
// cukup untuk 60 bulan. '10y' mengembalikan 2.467 bar. Emiten yang memang belum listing
// selama itu (GOTO: 1.040 bar) mengembalikan apa adanya, dan itu benar - mereka lalu
// gugur dari jendela panjang lewat penyaring di simulateBacktest, terhitung sebagai
// `excludedShortHistory`.
const FETCH_RANGE = '10y';

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
export function computeTickerSeries(ticker: string, rawHistory: OhlcRow[]): TickerIndicatorSeries | null {
  if (rawHistory.length <= LOOKBACK_DAYS) return null;

  // Dipotong SEBELUM loop, bukan sesudahnya. Yahoo '10y' mengirim ~2.467 bar sementara
  // yang disimpan hanya RETAIN_DAYS; menjalankan 9 analyzer atas seluruh 2.267 hari lalu
  // membuang dua pertiganya berarti membayar 1,7x komputasi untuk hasil yang identik -
  // dan cron ini punya batas 60 detik.
  const history = rawHistory.slice(-(RETAIN_DAYS + LOOKBACK_DAYS));

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
  const result = await fetchYahooHistoryDirect(ticker, FETCH_RANGE);
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

  const ihsgResult = await fetchYahooHistoryDirect('^JKSE', FETCH_RANGE);
  const ihsg: DailyBar[] = ihsgResult
    ? ihsgResult.history.slice(LOOKBACK_DAYS).slice(-RETAIN_DAYS).map((h) => ({ date: h.Date.split('T')[0], close: h.Close, open: h.Open }))
    : [];

  return { computedAt: new Date().toISOString(), ihsg, tickers };
}
