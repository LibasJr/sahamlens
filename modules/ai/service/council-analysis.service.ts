import YahooFinanceClass from 'yahoo-finance2';
import { getCouncil } from './council.service';
import { runLocalCouncil } from './local-council.service';
import { getCouncilCache } from './council-cache.service';
import {
  analyzeEma,
  analyzeRsi,
  analyzeMacd,
  analyzeVolatility,
  fetchYahooHistory,
  calculateScore,
} from '@/modules/technical';
import { computeDailyNetFlow, computeAccumulationStreak, analyzeAccumulationSignal, analyzeBandarmology } from '@/modules/market';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

// BUILD 009 (Performance) - fetch+parse OHLC dipindah ke modules/technical/service/
// yahoo-history.service.ts (sebelumnya diduplikasi persis di sini dan di
// modules/ai/service/orchestrator.service.ts). Logika analyzer/MA khusus kebutuhan
// council DIPERLUAS 2026-08-01 (audit dummy-data) - lihat catatan "Skor Komposit" di
// GET handler untuk apa yang berubah.
//
// BUG FIX (audit integritas data 2026-08-03, temuan M-03): EMA/RSI/MACD/ATR di bawah
// SEBELUMNYA diambil lewat `parseNumberAfter()` - regex ad-hoc yang mem-parse string
// `value` (mis. "RSI: 65.23") milik analyzer. Fungsi itu sendiri lahir dari perbaikan
// bug parsing sebelumnya (2026-08-01) - pola regex-di-atas-string tetap rapuh terhadap
// perubahan format `value`. Analyzer sekarang menyediakan `raw` (angka asli, lihat
// modules/technical/service/analyzers/*.ts) - dipakai langsung di bawah, tanpa regex.
async function getTechnicalData(ticker: string) {
  try {
    const chartData = await fetchYahooHistory(ticker, '1y');
    if (!chartData) return null;
    const { history, currentPrice } = chartData;

    // BUG FIX (audit 2026-08-05, temuan M-1): AdjClose (disesuaikan dividen) - analyzer
    // di baris berikutnya SUDAH memakai AdjClose, jadi MA yang dihitung dari Close mentah
    // di sini membuat komponen MA Trend milik Council berbeda basis dari MA Trend milik
    // Detail Saham untuk saham & hari yang sama.
    const closes = history.map(h => h.AdjClose ?? h.Close);
    const emaData = analyzeEma(history, currentPrice);
    const rsiData = analyzeRsi(history, currentPrice);
    const macdData = analyzeMacd(history, currentPrice);
    const volatilityData = analyzeVolatility(history, currentPrice);

    // BUG FIX (temuan H-2): `Math.min(period, len)` dulu menghasilkan angka yang dinamai
    // MA200 dari bar seadanya. null kalau bar belum cukup.
    const maOf = (period: number): number | null =>
      closes.length >= period ? closes.slice(-period).reduce((a, b) => a + b, 0) / period : null;
    const ma20 = maOf(20);
    const ma50 = maOf(50);
    const ma200 = maOf(200);

    let support = Infinity;
    let resistance = 0;
    history.slice(-20).forEach(h => {
      if (h.Low < support) support = h.Low;
      if (h.High > resistance) resistance = h.High;
    });
    if (support === Infinity) support = 0;

    const volToday = history[history.length - 1]?.Volume;
    const volWindow = history.slice(-20);
    const volAvg20 = volWindow.length > 0 && volWindow.every((h) => isFiniteNonNegative(h.Volume))
      ? volWindow.reduce((s, h) => s + h.Volume, 0) / volWindow.length
      : null;

    // Foreign Flow (proxy dari harga+volume real, bukan data broker resmi) - logika
    // sama dengan app/api/stock/[ticker] dan modules/ai orchestrator, satu sumber
    // kebenaran (modules/market/service/foreign-flow-proxy.ts).
    const flowHistory = history.map((h) => ({ date: h.Date.split('T')[0], high: h.High, low: h.Low, close: h.Close, volume: h.Volume }));
    const dailyFlow = computeDailyNetFlow(flowHistory).slice(-20);
    const buyStreak = computeAccumulationStreak(dailyFlow);
    let sellStreak = 0;
    for (let i = dailyFlow.length - 1; i >= 0; i--) {
      if (dailyFlow[i].netValueBillion < 0) sellStreak++;
      else break;
    }
    // BUG FIX (audit 2026-08-05, temuan M-1/M-2): aturan lama "3 hari netValue positif
    // berturut-turut" diganti konfirmasi 4-lapis analyzeAccumulationSignal() (CMF20 + CLV
    // 3 hari + volume spike + tren MFM) - definisi yang SAMA dipakai Detail Saham,
    // Recommendations, Screener, dan AI Pick. Sebelumnya Council satu-satunya yang masih
    // memakai aturan lama, sehingga status arus dananya bisa berbeda untuk saham & hari
    // yang sama.
    const accumulation = analyzeAccumulationSignal(flowHistory.slice(-20));
    const bandarmology = analyzeBandarmology(flowHistory.slice(-20));
    let foreignFlowStatus: 'STRONG NET BUY' | 'NET BUY' | 'NEUTRAL' | 'NET SELL' | 'STRONG NET SELL' = 'NEUTRAL';
    if (accumulation.status === 'AKUMULASI') foreignFlowStatus = buyStreak >= 4 ? 'STRONG NET BUY' : 'NET BUY';
    else if (accumulation.status === 'DISTRIBUSI') foreignFlowStatus = sellStreak >= 4 ? 'STRONG NET SELL' : 'NET SELL';

    // BUG FIX (audit logika & algoritma 2026-08-05, temuan C-4): keenam field di bawah
    // SEBELUMNYA pakai `?? 0`. Fix temuan H-11 di council.service.ts sudah benar
    // mengubah field yang hilang jadi 'N/A' ke prompt AI - TAPI penjaganya
    // `typeof data?.rsi === 'number'`, dan 0 ADALAH number. Jadi fix itu dimatikan oleh
    // pemanggilnya sendiri: AI tetap menerima "RSI 0.00" (disimpulkan oversold ekstrem),
    // "MA200 0" (disimpulkan uptrend ekstrem), dan angka 0 yang sama juga mengalir ke
    // calculateScore() di bawah (rsi < 40 -> +2 poin "OVERSOLD"). `null` membuat kedua
    // konsumen itu benar-benar tahu datanya tidak ada.
    return {
      price: currentPrice,
      ma20,
      ma50,
      ma200,
      ema: (emaData as any)?.raw?.ema20 ?? null,
      rsi: (rsiData as any)?.raw?.rsi ?? null,
      macdLine: (macdData as any)?.raw?.macdLine ?? null,
      macdSignal: (macdData as any)?.raw?.macdSignal ?? null,
      macdHist: (macdData as any)?.raw?.macdHist ?? null,
      atr: (volatilityData as any)?.raw?.atr ?? null,
      support,
      resistance,
      volToday: isFiniteNonNegative(volToday) ? volToday : null,
      volAvg20,
      volRatio: isFiniteNonNegative(volToday) && isFinitePositive(volAvg20) ? volToday / volAvg20 : null,
      foreignFlow: foreignFlowStatus,
      cmf20: bandarmology.cmf20,
      accumulationStatus: accumulation.status,
      consecutiveBuyDays: buyStreak,
      consecutiveSellDays: sellStreak,
      // P1-8 & P1-9 - input yang sama dipakai Detail Saham/Screener/AI Pick, supaya
      // skor komposit Council tidak berbeda untuk saham & hari yang sama.
      changePct: (() => {
        const prev = history[history.length - 2]?.Close;
        return isFinitePositive(prev) ? ((currentPrice - prev) / prev) * 100 : null;
      })(),
      mfmPositiveRatio20: accumulation.mfmPositiveRatio20,
    };
  } catch (e) {
    return null;
  }
}

// Proxy freshness (2026-08-01) - Council sebelumnya cache per KALENDER HARI penuh (24 jam),
// jadi kalau ada laporan keuangan baru dirilis emiten hari yang sama, Council tetap
// menyajikan analisa basi sampai lewat tengah malam. Tidak ada feed/webhook resmi BEI
// gratis untuk trigger instan, jadi solusinya proxy jujur: ambil snapshot ringan
// "kuartal terakhir yang dilaporkan" dari Yahoo Finance (mostRecentQuarter) - begitu
// Yahoo mendeteksi kuartal baru (yang biasanya update dalam 1-2 hari setelah rilis resmi
// emiten), fingerprint ini berubah dan cache lama otomatis dianggap basi & dihitung ulang,
// TANPA menunggu hari kalender berikutnya.
interface FundamentalSnapshot {
  mostRecentQuarter: string | null;
  trailingEps: number | null;
  per: number | null;
  pbv: number | null;
  roe: number | null;
  der: number | null;
  currentRatio: number | null;
  revenueGrowth: number | null;
  /** Konteks sektor untuk penilaian valuasi & kesehatan neraca (P1-10/P1-11/P1-12).
   * Tanpa ini Council menilai bank dengan ambang DER emiten manufaktur - dan skornya
   * akan berbeda dari Detail Saham untuk saham yang sama, yang justru kelas bug yang
   * sedang ditutup (INVARIAN: satu ticker, satu hari, satu skor). */
  sector: {
    yahooSector: string | null;
    yahooIndustry: string | null;
    payoutRatio: number | null;
    beta: number | null;
  };
}

async function getFundamentalSnapshot(ticker: string): Promise<FundamentalSnapshot | null> {
  try {
    const quoteSummary = await yahooFinance.quoteSummary(ticker, {
      modules: ['assetProfile', 'defaultKeyStatistics', 'financialData', 'summaryDetail'],
    });
    const mrq = quoteSummary?.defaultKeyStatistics?.mostRecentQuarter;
    return {
      mostRecentQuarter: mrq ? new Date(mrq).toISOString().split('T')[0] : null,
      trailingEps: quoteSummary?.defaultKeyStatistics?.trailingEps ?? null,
      per: quoteSummary?.summaryDetail?.trailingPE ?? null,
      pbv: quoteSummary?.defaultKeyStatistics?.priceToBook ?? null,
      roe: quoteSummary?.financialData?.returnOnEquity != null ? quoteSummary.financialData.returnOnEquity * 100 : null,
      der: quoteSummary?.financialData?.debtToEquity != null ? quoteSummary.financialData.debtToEquity / 100 : null,
      currentRatio: quoteSummary?.financialData?.currentRatio ?? null,
      revenueGrowth: quoteSummary?.financialData?.revenueGrowth != null ? quoteSummary.financialData.revenueGrowth * 100 : null,
      sector: {
        yahooSector: quoteSummary?.assetProfile?.sector ?? null,
        yahooIndustry: quoteSummary?.assetProfile?.industry ?? null,
        payoutRatio: quoteSummary?.summaryDetail?.payoutRatio ?? null,
        beta: null,
      },
    };
  } catch {
    return null;
  }
}


export type CouncilAnalysisResult =
  | { ok: true; data: any }
  | { ok: false; status: 503; code: 'MARKET_DATA_UNAVAILABLE'; error: string; detail: string };

/**
 * Pure Council analysis entry point. No HTTP auth/cookie semantics live here.
 * Route Handlers own trial-cookie issuance; Server Components with an authenticated
 * session can call this directly to avoid self-fetch/cold-start duplication.
 */
export async function runCouncilAnalysis(symbol: string): Promise<CouncilAnalysisResult> {
  const today = new Date().toISOString().split('T')[0];
  const fundamentalSnapshot = await getFundamentalSnapshot(symbol);
  const cacheKey = `${today}:${fundamentalSnapshot?.mostRecentQuarter || 'na'}`;

  const cached = await getCouncilCache(symbol, cacheKey);
  if (cached) return { ok: true, data: cached };

  const technicalData = await getTechnicalData(symbol);
  if (!technicalData) {
    return {
      ok: false,
      status: 503,
      code: 'MARKET_DATA_UNAVAILABLE',
      error: 'Data harga tidak tersedia',
      detail: `Histori harga ${symbol} tidak bisa diambil dari sumber data saat ini, jadi analisa tidak dihitung. Coba lagi beberapa saat lagi.`,
    };
  }

  (technicalData as any).fundamentalSnapshot = fundamentalSnapshot;
  const scoringResult = calculateScore(
    symbol,
    {
      currentPrice: technicalData.price,
      ma20: technicalData.ma20,
      ma50: technicalData.ma50,
      ma200: technicalData.ma200,
      rsi: technicalData.rsi,
      macdHist: technicalData.macdHist,
      macdLine: technicalData.macdLine,
      macdSignal: technicalData.macdSignal,
      volToday: technicalData.volToday,
      volAvg20: technicalData.volAvg20,
      changePct: technicalData.changePct,
    },
    {
      per: fundamentalSnapshot?.per ?? null,
      pbv: fundamentalSnapshot?.pbv ?? null,
      roe: fundamentalSnapshot?.roe ?? null,
      der: fundamentalSnapshot?.der ?? null,
      currentRatio: fundamentalSnapshot?.currentRatio ?? null,
      revenueGrowth: fundamentalSnapshot?.revenueGrowth ?? null,
      sector: fundamentalSnapshot?.sector,
    },
    {
      cmf20: technicalData.cmf20,
      accumulationStatus: technicalData.accumulationStatus,
      consecutiveBuyDays: technicalData.consecutiveBuyDays,
      consecutiveSellDays: technicalData.consecutiveSellDays,
      volRatio: technicalData.volRatio,
      mfmPositiveRatio20: technicalData.mfmPositiveRatio20,
    },
  );
  (technicalData as any).score = scoringResult.total_score;

  try {
    return { ok: true, data: await getCouncil(symbol, technicalData, cacheKey) };
  } catch (error) {
    console.warn('Gemini API failed, using local fallback', error);
    return { ok: true, data: runLocalCouncil(symbol, technicalData) };
  }
}
