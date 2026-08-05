import { fetchYahooHistory, analyzeRsi, analyzeMacd, analyzeVolatility, calculateScore, type FundamentalInput } from '../../technical';
import { computeDailyNetFlow, computeAccumulationStreak, analyzeAccumulationSignal, analyzeBandarmology } from '../../market';
import { AI_PICK_UNIVERSE } from '../../market/constants/ai-pick-universe';
import { readFundamentalSnapshot, type FundamentalSnapshot } from '../../../shared/cache/ai-pick-cache';
import { estimateFullDayVolume, isIdxMarketHoursNow, todayDateKeyWIB } from '../../../shared/market/trading-session';
import { evaluateMinimalEligibility } from '../../eligibility';
import { logger } from '../../../shared/logger/logger';
import type { ScoredStock } from './ai-pick.service';
import { buildLongTradingSetup } from './trading-setup';
import {
  PRICE_ADJUSTMENT_VERSION,
  RETURN_PRICE_BASIS,
} from '../../../shared/market/price-basis';

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

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
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
  const lastClose = history[history.length - 1]?.Close;
  const currentPrice = isFinitePositive(res.currentPrice)
    ? res.currentPrice
    : isFinitePositive(lastClose)
    ? lastClose
    : null;
  if (currentPrice == null) return null;
  // FASE 3: MA/RSI/MACD/momentum memakai adjusted close eksplisit. Missing AdjClose
  // berarti komponen return-based tidak dihitung, bukan fallback ke raw Close.
  const adjustedCloses = history.every((h) => typeof h.AdjClose === 'number' && Number.isFinite(h.AdjClose) && h.AdjClose > 0)
    ? history.map((h) => h.AdjClose as number)
    : null;
  const currentAdjustedPrice = adjustedCloses ? adjustedCloses[adjustedCloses.length - 1] : null;
  const prevCloseRaw = history[history.length - 2]?.Close;
  if (!isFinitePositive(prevCloseRaw)) return null;
  const changePct = ((currentPrice - prevCloseRaw) / prevCloseRaw) * 100;

  const ma20 = adjustedCloses ? sma(adjustedCloses, 20) : null;
  const ma50 = adjustedCloses ? sma(adjustedCloses, 50) : null;
  const ma200 = adjustedCloses ? sma(adjustedCloses, 200) : null;
  const rsiResult = analyzeRsi(history, currentPrice);
  const macdResult = analyzeMacd(history, currentPrice);
  // ATR-14 - dasar hitung TP1/TP2/CL1/CL2 di ai-pick.service.ts rankAiPicks(). `history`
  // di sini sudah 2 tahun OHLC (fetchYahooHistory di atas), jauh lebih dari cukup - tidak
  // perlu fetch tambahan. Reuse analyzer yang sama dipakai Stock Detail (LensTechnical),
  // bukan rumus baru dikarang.
  const volatilityResult = analyzeVolatility(history, currentPrice);
  const atr = typeof volatilityResult?.raw?.atr === 'number' ? volatilityResult.raw.atr : null;
  const tradeSetup = buildLongTradingSetup(
    history.map((h) => ({ High: h.High, Low: h.Low, Close: h.Close, AdjClose: h.AdjClose })),
    currentPrice,
    atr,
  );
  // Fallback 50/0 dihapus (audit 2026-08-05, temuan C-7) - lihat app/api/stock/[ticker].
  const rsi = typeof rsiResult?.raw?.rsi === 'number' ? rsiResult.raw.rsi : null;
  const macdLineVal = typeof macdResult?.raw?.macdLine === 'number' ? macdResult.raw.macdLine : null;
  const macdSigVal = typeof macdResult?.raw?.macdSignal === 'number' ? macdResult.raw.macdSignal : null;
  const macdHistVal = typeof macdResult?.raw?.macdHist === 'number' ? macdResult.raw.macdHist : null;

  // BUG FIX (pola M-02): volume bar terakhir masih PARSIAL selama jam bursa - sama
  // seperti screener.service.ts/live-filter-check.service.ts.
  const lastBar = history[history.length - 1];
  const isLiveFormingBar = lastBar.Date.split('T')[0] === todayDateKeyWIB() && isIdxMarketHoursNow();
  const adjustedHistory = isLiveFormingBar
    ? [...history.slice(0, -1), { ...lastBar, Volume: estimateFullDayVolume(lastBar.Volume) }]
    : history;
  const volToday = adjustedHistory[adjustedHistory.length - 1]?.Volume;
  if (!isFiniteNonNegative(volToday)) return null;
  const volWindow = adjustedHistory.slice(-20);
  const volAvg20 = volWindow.length > 0 && volWindow.every((h) => isFiniteNonNegative(h.Volume))
    ? volWindow.reduce((s, h) => s + h.Volume, 0) / volWindow.length
    : null;
  const volRatio = isFinitePositive(volAvg20) ? volToday / volAvg20 : null;

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
      // `?? 0` dihapus (temuan H-2/C-7): MA yang belum bisa dihitung dikirim null, bukan
      // 0 - harga selalu > 0 sehingga "harga > MA200(0)" dulu SELALU true dan memberi
      // poin uptrend gratis untuk saham berhistori pendek.
      currentPrice,
      currentRawPrice: currentPrice,
      currentAdjustedPrice,
      currentPriceBasis: currentAdjustedPrice == null ? 'UNKNOWN' : RETURN_PRICE_BASIS,
      maPriceBasis: adjustedCloses == null ? 'UNKNOWN' : RETURN_PRICE_BASIS,
      adjustmentVersion: PRICE_ADJUSTMENT_VERSION,
      corporateActionStatus: 'NONE',
      ma20, ma50, ma200, rsi,
      macdHist: macdHistVal, macdLine: macdLineVal, macdSignal: macdSigVal,
      volToday, volAvg20,
      changePct,   // P1-8: volume besar tanpa arah harga bukan konfirmasi beli
    },
    fundamental,
    // Satu kelompok arus dana (temuan H-1).
    {
      cmf20: bandarmology.cmf20,
      accumulationStatus: accumulation.status,
      consecutiveBuyDays: buyStreak,
      consecutiveSellDays: sellStreak,
      volRatio,
      mfmPositiveRatio20: accumulation.mfmPositiveRatio20,  // P1-9
    }
  );

  // Definisi bearish sama dengan market-summary.service.ts - null (data kurang)
  // diperlakukan aman sebagai "bukan bearish", bukan ditebak.
  const bearish = ma20 != null && ma50 != null && currentAdjustedPrice != null && currentAdjustedPrice < ma20 && ma20 < ma50;

  // GERBANG KELAYAKAN MINIMAL (P0-3). Dijalankan SETELAH skor dihitung karena salah
  // satu gerbangnya (kelengkapan data) memakai `coverage_pct`, tapi hasilnya dipakai
  // SEBELUM pemeringkatan di rankAiPicks() - saham tidak layak tidak pernah jadi
  // kandidat, bukan sekadar diberi peringkat rendah.
  //
  // Bar mentah `history` (bukan `adjustedHistory`) dipakai di sini: estimasi volume
  // penuh untuk bar hari ini adalah alat untuk membandingkan rasio volume, sementara
  // gerbang ini menanyakan hal berbeda - "apakah ada transaksi tercatat" dan "berapa
  // nilai transaksi rata-ratanya". Memakai angka hasil estimasi untuk menjawab itu
  // berarti menilai kelayakan atas angka yang kita karang sendiri.
  const eligibility = evaluateMinimalEligibility({
    ticker,
    asOf: todayDateKeyWIB(),
    bars: history.map((h) => ({
      date: h.Date.split('T')[0],
      close: typeof h.Close === 'number' ? h.Close : null,
      volume: typeof h.Volume === 'number' ? h.Volume : null,
    })),
    coveragePct: scoring.coverage_pct,
  });

  return {
    scored: {
      symbol: ticker,
      price: currentPrice,
      changePct: parseFloat(changePct.toFixed(2)),
      totalScore: scoring.total_score,
      // null kalau RSI tidak bisa dihitung - bonus "oversold" di rankAiPicks() melewati
      // saham ini alih-alih memakai angka pengganti (temuan C-7).
      rsi: rsi != null ? parseFloat(rsi.toFixed(1)) : null,
      accumulationConfirmed,
      atr,
      // Kelengkapan data di balik skor - WAJIB ikut sampai UI (audit skor 2026-08-05):
      // combine() di scoring.service.ts merenormalisasi bobot komponen yang datanya
      // tidak ada (mis. bank tanpa DER/Current Ratio di Yahoo), jadi skor 82 dari
      // coverage 90% bukan klaim yang setara dengan 82 dari coverage 100%. Angka ini
      // sudah lama dihitung tapi tidak pernah diteruskan ke pengguna.
      coverage: scoring.coverage_pct,
      // P0-1: kategori SEBELUMNYA dibuang di sini - `ScoredStock` tidak punya field-nya
      // sama sekali, sehingga rankAiPicks() tidak punya cara apa pun untuk tahu bahwa
      // sistem sendiri sudah menilai saham ini 'DATA TIDAK CUKUP'.
      kategori: scoring.kategori,
      eligibilityStatus: eligibility.status,
      eligibilityReasons: eligibility.reasonCodes,
      tradeSetup: tradeSetup
        ? {
          tp1: tradeSetup.tp1,
          tp2: tradeSetup.tp2,
          cl1: tradeSetup.cl1,
          cl2: tradeSetup.cl2,
          rr: tradeSetup.rr,
        }
        : null,
      // Audit BUILD 003 (Explainable AI) - breakdown & alasan LANGSUNG dari
      // calculateScore(), bukan dihitung ulang/dikarang di sini.
      breakdown: {
        technical: scoring.technical_score,
        fundamental: scoring.fundamental_score,
        flow: scoring.flow_score,
      },
      topReasons: scoring.alasan_3_poin,
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
