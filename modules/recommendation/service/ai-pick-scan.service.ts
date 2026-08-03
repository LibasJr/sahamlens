import { fetchYahooHistory, calculateScore, type FundamentalInput } from '../../technical';
import { computeDailyNetFlow, computeAccumulationStreak, analyzeAccumulationSignal } from '../../market';
import { AI_PICK_UNIVERSE } from '../../market/constants/ai-pick-universe';
import { readFundamentalSnapshot, type FundamentalSnapshot } from '../../../shared/cache/ai-pick-cache';
import { logger } from '../../../shared/logger/logger';
import type { ScoredStock } from './ai-pick.service';

const BATCH_SIZE = 15;
const EMPTY_FUNDAMENTAL: FundamentalInput = {
  per: null, pbv: null, roe: null, der: null, currentRatio: null, revenueGrowth: null,
};

/** Dipisah jadi fungsi murni supaya kasus "snapshot belum terisi" bisa diuji tanpa
 * jaringan. Mengembalikan field null alih-alih melempar: calculateScore() sudah
 * menangani null dengan skor 0 + alasan "DATA TIDAK LENGKAP", jadi peringkat tetap
 * jalan dari teknikal + flow saja. */
export function resolveFundamental(
  snapshot: FundamentalSnapshot | null,
  ticker: string
): FundamentalInput {
  return snapshot?.[ticker] ?? EMPTY_FUNDAMENTAL;
}

function sma(values: number[], period: number): number {
  if (values.length < period) return 0;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function rsi14(closes: number[]): number {
  if (closes.length < 15) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function macd(closes: number[]): { line: number; signal: number; hist: number } {
  if (closes.length < 35) return { line: 0, signal: 0, hist: 0 };
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdSeries = closes.map((_, i) => ema12[i] - ema26[i]);
  const signalSeries = ema(macdSeries, 9);
  const line = macdSeries[macdSeries.length - 1];
  const signal = signalSeries[signalSeries.length - 1];
  return { line, signal, hist: line - signal };
}

async function scoreOne(
  ticker: string,
  fundamental: FundamentalInput
): Promise<{ scored: ScoredStock; bearish: boolean } | null> {
  const res = await fetchYahooHistory(ticker, '2y');
  if (!res || res.history.length < 60) {
    logger.warn('AI Pick scan: histori tidak cukup', { ticker });
    return null;
  }

  const history = res.history;
  const closes = history.map((h) => h.Close);
  const volumes = history.map((h) => h.Volume);
  const currentPrice = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2] || currentPrice;
  const changePct = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  const rsi = rsi14(closes);
  const m = macd(closes);
  const volToday = volumes[volumes.length - 1] || 0;
  const volAvg20 = sma(volumes, 20);
  const volRatio = volAvg20 > 0 ? volToday / volAvg20 : 1;

  const ohlcv = history.map((h) => ({
    date: h.Date, high: h.High, low: h.Low, close: h.Close, volume: h.Volume,
  }));
  const dailyFlow = computeDailyNetFlow(ohlcv).slice(-20);
  const streak = computeAccumulationStreak(dailyFlow);
  const accumulationConfirmed = analyzeAccumulationSignal(ohlcv.slice(-20)).status === 'AKUMULASI';

  // Label arus dana memakai ambang yang sama dengan recommendation.service.ts:126-130
  // supaya scoreAsing() menerima masukan yang konsisten dengan fitur lain.
  let foreignFlow = 'NEUTRAL';
  if (changePct > 0.5 && volRatio > 1.2) foreignFlow = 'STRONG NET BUY';
  else if (changePct > 0) foreignFlow = 'NET BUY';
  else if (changePct < -0.5 && volRatio > 1.2) foreignFlow = 'STRONG NET SELL';
  else if (changePct < 0) foreignFlow = 'NET SELL';

  const scoring = calculateScore(
    ticker.replace('.JK', ''),
    {
      currentPrice, ma20, ma50, ma200, rsi,
      macdHist: m.hist, macdLine: m.line, macdSignal: m.signal,
      volToday, volAvg20,
    },
    fundamental,
    {
      foreignFlow,
      consecutiveBuyDays: foreignFlow.includes('BUY') ? streak : 0,
      consecutiveSellDays: 0,
      volRatio,
    }
  );

  // Definisi bearish sama dengan market-summary.service.ts:141-142.
  const bearish = currentPrice < ma20 && ma20 < ma50;

  return {
    scored: {
      symbol: ticker,
      price: currentPrice,
      changePct: parseFloat(changePct.toFixed(2)),
      totalScore: scoring.total_score,
      rsi: parseFloat(rsi.toFixed(1)),
      accumulationConfirmed,
    },
    bearish,
  };
}

/**
 * @param injectedSnapshot Dipakai pengujian untuk memasok snapshot fundamental tanpa
 * Redis. Produksi memanggil tanpa argumen sehingga snapshot dibaca dari cache.
 */
export async function scanAiPickScores(
  injectedSnapshot?: FundamentalSnapshot | null
): Promise<{ scores: ScoredStock[]; bearishSymbols: string[] }> {
  // Snapshot fundamental boleh kosong - calculateScore() menangani null dengan skor 0
  // dan alasan "DATA TIDAK LENGKAP", jadi peringkat tetap jalan dari teknikal + flow
  // saja alih-alih menggagalkan seluruh halaman.
  const snapshot = injectedSnapshot !== undefined ? injectedSnapshot : await readFundamentalSnapshot();

  const scores: ScoredStock[] = [];
  const bearishSymbols: string[] = [];

  for (let i = 0; i < AI_PICK_UNIVERSE.length; i += BATCH_SIZE) {
    const batch = AI_PICK_UNIVERSE.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((t) => scoreOne(t, resolveFundamental(snapshot, t)))
    );
    for (const r of results) {
      if (!r) continue;
      scores.push(r.scored);
      if (r.bearish) bearishSymbols.push(r.scored.symbol);
    }
  }

  return { scores, bearishSymbols };
}
