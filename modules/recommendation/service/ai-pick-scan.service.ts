import { fetchYahooHistory, analyzeRsi, analyzeMacd, calculateScore, type FundamentalInput } from '../../technical';
import { computeDailyNetFlow, computeAccumulationStreak, analyzeAccumulationSignal, analyzeBandarmology } from '../../market';
import { AI_PICK_UNIVERSE } from '../../market/constants/ai-pick-universe';
import { readFundamentalSnapshot, type FundamentalSnapshot } from '../../../shared/cache/ai-pick-cache';
import { estimateFullDayVolume, isIdxMarketHoursNow, todayDateKeyWIB } from '../../../shared/market/trading-session';
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

// BUG FIX (audit BUILD 001 2026-08-03): fungsi sma/rsi14/ema/macd lokal di bawah ini
// SEBELUMNYA menghitung ulang indikator dengan implementasi SENDIRI (RSI rata-rata
// sederhana, bukan Wilder; Close mentah, bukan AdjClose; tanpa validasi minimum bar -
// sma() balikin 0 kalau data kurang, bukan null) - terpisah total dari
// modules/technical yang dipakai Stock Detail/Screener/Recommendations. Akibatnya AI
// Pick (fitur paling utama) bisa menampilkan RSI/MACD/kategori BERBEDA untuk saham+hari
// yang SAMA PERSIS dibanding halaman lain - persis pola "Technical=BUY, AI=STRONG BUY"
// yang jadi keluhan utama audit. Sekarang pakai analyzeRsi/analyzeMacd (Wilder RSI +
// AdjClose) yang sama, dan foreignFlow pakai analyzeAccumulationSignal (bukan heuristik
// arah harga) - definisi SAMA dengan recommendation.service.ts/screener.service.ts.
function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
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

  const { history } = res;
  // Harga LIVE (regularMarketPrice dari meta Yahoo), bukan Close bar harian terakhir -
  // konsisten dengan Screener/Recommendations yang sama-sama pakai quote live, bukan
  // harga EOD kemarin yang bisa basi selama jam bursa.
  const currentPrice = res.currentPrice || history[history.length - 1].Close;
  const closes = history.map((h) => h.AdjClose ?? h.Close);
  const prevCloseRaw = history[history.length - 2]?.Close || currentPrice;
  const changePct = prevCloseRaw ? ((currentPrice - prevCloseRaw) / prevCloseRaw) * 100 : 0;

  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  const rsiResult = analyzeRsi(history, currentPrice);
  const macdResult = analyzeMacd(history, currentPrice);
  const rsi = typeof rsiResult?.raw?.rsi === 'number' ? rsiResult.raw.rsi : 50;
  const macdLineVal = typeof macdResult?.raw?.macdLine === 'number' ? macdResult.raw.macdLine : 0;
  const macdSigVal = typeof macdResult?.raw?.macdSignal === 'number' ? macdResult.raw.macdSignal : 0;
  const macdHistVal = typeof macdResult?.raw?.macdHist === 'number' ? macdResult.raw.macdHist : 0;

  // BUG FIX (pola M-02): volume bar terakhir masih PARSIAL selama jam bursa - sama
  // seperti screener.service.ts/live-filter-check.service.ts.
  const lastBar = history[history.length - 1];
  const isLiveFormingBar = lastBar.Date.split('T')[0] === todayDateKeyWIB() && isIdxMarketHoursNow();
  const adjustedHistory = isLiveFormingBar
    ? [...history.slice(0, -1), { ...lastBar, Volume: estimateFullDayVolume(lastBar.Volume) }]
    : history;
  const volToday = adjustedHistory[adjustedHistory.length - 1].Volume || 0;
  const volAvg20 = adjustedHistory.slice(-20).reduce((s, h) => s + h.Volume, 0) / Math.min(20, adjustedHistory.length);
  const volRatio = volAvg20 > 0 ? volToday / volAvg20 : 1;

  // Shape {date,high,low,close,volume} untuk Bandarmology/CMF/arus dana - Close MENTAH
  // (bukan AdjClose), sama seperti recommendation.service.ts/screener.service.ts.
  const dailyHistory = history.map((h) => ({ date: h.Date.split('T')[0], high: h.High, low: h.Low, close: h.Close, volume: h.Volume }));
  const dailyFlow = computeDailyNetFlow(dailyHistory).slice(-20);
  const buyStreak = computeAccumulationStreak(dailyFlow);
  let sellStreak = 0;
  for (let i = dailyFlow.length - 1; i >= 0; i--) {
    if (dailyFlow[i].netValueBillion < 0) sellStreak++;
    else break;
  }
  const accumulation = analyzeAccumulationSignal(dailyHistory.slice(-20));
  const accumulationConfirmed = accumulation.status === 'AKUMULASI';
  const bandarmology = analyzeBandarmology(dailyHistory.slice(-20));

  // BUG FIX (temuan H-03, sekarang disamakan ke AI Pick juga): foreignFlow dari status
  // analyzeAccumulationSignal (CMF20 + CLV 3 hari + volume spike + tren MFM), BUKAN lagi
  // dari arah changePct/volRatio - supaya scoreAsing()/scoreBandar() menerima masukan
  // yang konsisten dengan Recommendations/Screener untuk saham+hari yang sama.
  let foreignFlow: 'STRONG NET BUY' | 'NET BUY' | 'NEUTRAL' | 'NET SELL' | 'STRONG NET SELL' = 'NEUTRAL';
  if (accumulation.status === 'AKUMULASI') foreignFlow = buyStreak >= 4 ? 'STRONG NET BUY' : 'NET BUY';
  else if (accumulation.status === 'DISTRIBUSI') foreignFlow = sellStreak >= 4 ? 'STRONG NET SELL' : 'NET SELL';

  const scoring = calculateScore(
    ticker.replace('.JK', ''),
    {
      currentPrice, ma20: ma20 ?? 0, ma50: ma50 ?? 0, ma200: ma200 ?? 0, rsi,
      macdHist: macdHistVal, macdLine: macdLineVal, macdSignal: macdSigVal,
      volToday, volAvg20,
    },
    fundamental,
    { foreignFlow, consecutiveBuyDays: buyStreak, consecutiveSellDays: sellStreak, volRatio, cmf20: bandarmology.cmf20 }
  );

  // Definisi bearish sama dengan market-summary.service.ts - null (data kurang)
  // diperlakukan aman sebagai "bukan bearish", bukan ditebak.
  const bearish = ma20 != null && ma50 != null && currentPrice < ma20 && ma20 < ma50;

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
