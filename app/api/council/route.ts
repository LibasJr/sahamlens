import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';
import { getCouncil, runLocalCouncil, getCouncilCache } from '@/modules/ai';
import { getSession, checkProAccessLive } from '@/modules/user';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

// Minimal technical analyzer functions from existing codebase
import {
  analyzeEma,
  analyzeRsi,
  analyzeMacd,
  analyzeVolatility,
  fetchYahooHistory,
  calculateScore,
} from '@/modules/technical';
import { computeDailyNetFlow, computeAccumulationStreak } from '@/modules/market';

// AUDIT 2026-08-01: RSI/EMA sebelumnya diisi langsung dari analyzer.value ("RSI: 65.23",
// bukan angka) - typeof check di council.service.ts (butuh number) gagal diam-diam dan
// RSI selalu terkirim sebagai "0" ke Council AI, dan rsiSignal di local-council.service.ts
// (perbandingan numerik terhadap string) selalu jatuh ke "HOLD". Sekarang di-parse jadi
// angka mentah, sama seperti pola yang sudah dipakai app/api/stock/[ticker]/route.ts.
function parseNumberAfter(value: string | undefined, label: string): number {
  if (!value) return 0;
  const match = value.match(new RegExp(`${label}:\\s*([\\-\\d.]+)`));
  return match ? parseFloat(match[1]) : 0;
}

// BUILD 009 (Performance) - fetch+parse OHLC dipindah ke modules/technical/service/
// yahoo-history.service.ts (sebelumnya diduplikasi persis di sini dan di
// modules/ai/service/orchestrator.service.ts). Logika analyzer/MA khusus kebutuhan
// council DIPERLUAS 2026-08-01 (audit dummy-data) - lihat parseNumberAfter di atas
// dan catatan "Skor Komposit" di GET handler untuk apa yang berubah.
async function getTechnicalData(ticker: string) {
  try {
    const chartData = await fetchYahooHistory(ticker, '1y');
    if (!chartData) return null;
    const { history, currentPrice } = chartData;

    const closes = history.map(h => h.Close);
    const emaData = analyzeEma(history, currentPrice);
    const rsiData = analyzeRsi(history, currentPrice);
    const macdData = analyzeMacd(history, currentPrice);
    const volatilityData = analyzeVolatility(history, currentPrice);

    const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length);
    const ma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, closes.length);
    const ma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / Math.min(200, closes.length);

    let support = Infinity;
    let resistance = 0;
    history.slice(-20).forEach(h => {
      if (h.Low < support) support = h.Low;
      if (h.High > resistance) resistance = h.High;
    });
    if (support === Infinity) support = 0;

    const volToday = history[history.length - 1]?.Volume || 0;
    const volAvg20 = history.slice(-20).reduce((s, h) => s + h.Volume, 0) / Math.min(20, history.length);

    // Foreign Flow (proxy dari harga+volume real, bukan data broker resmi) - logika
    // sama dengan app/api/stock/[ticker] dan modules/ai orchestrator, satu sumber
    // kebenaran (modules/market/service/foreign-flow-proxy.ts).
    const flowHistory = history.map((h) => ({ date: h.Date.split('T')[0], close: h.Close, volume: h.Volume }));
    const dailyFlow = computeDailyNetFlow(flowHistory).slice(-20);
    const buyStreak = computeAccumulationStreak(dailyFlow);
    let sellStreak = 0;
    for (let i = dailyFlow.length - 1; i >= 0; i--) {
      if (dailyFlow[i].netValueBillion < 0) sellStreak++;
      else break;
    }
    const last3 = dailyFlow.slice(-3);
    const isAccumulation3D = last3.length === 3 && last3.every((d) => d.netValueBillion > 0);
    const isDistribution3D = last3.length === 3 && last3.every((d) => d.netValueBillion < 0);
    let foreignFlowStatus: 'STRONG NET BUY' | 'NET BUY' | 'NEUTRAL' | 'NET SELL' | 'STRONG NET SELL' = 'NEUTRAL';
    if (isAccumulation3D) foreignFlowStatus = buyStreak >= 4 ? 'STRONG NET BUY' : 'NET BUY';
    else if (isDistribution3D) foreignFlowStatus = sellStreak >= 4 ? 'STRONG NET SELL' : 'NET SELL';

    return {
      price: currentPrice,
      ma20,
      ma50,
      ma200,
      ema: parseNumberAfter(emaData?.value, 'EMA20'),
      rsi: parseNumberAfter(rsiData?.value, 'RSI'),
      macdLine: parseNumberAfter(macdData?.value, 'MACD'),
      macdSignal: parseNumberAfter(macdData?.value, 'Sig'),
      macdHist: parseNumberAfter(macdData?.value, 'Hist'),
      atr: parseNumberAfter(volatilityData?.value, 'ATR'),
      support,
      resistance,
      volToday,
      volAvg20,
      volRatio: volAvg20 > 0 ? volToday / volAvg20 : 1,
      foreignFlow: foreignFlowStatus,
      consecutiveBuyDays: buyStreak,
      consecutiveSellDays: sellStreak,
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
}

async function getFundamentalSnapshot(ticker: string): Promise<FundamentalSnapshot | null> {
  try {
    const quoteSummary = await yahooFinance.quoteSummary(ticker, {
      modules: ['defaultKeyStatistics', 'financialData', 'summaryDetail'],
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
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol') || 'DGWG.JK';

    // Check limits - pengunjung tanpa akun bisa akses selama trial 7 hari (lihat
    // shared/auth/anonymous-trial.ts) - trial aktif melewati gerbang Pro juga.
    const session = await getSession();
    let anonTrial: AnonTrialState | null = null;
    if (!session) {
      anonTrial = await readOrIssueAnonymousTrial();
      if (!anonTrial.active) {
        return NextResponse.json({ error: 'Belum login' }, { status: 401 });
      }
    }

    const hasPro = anonTrial?.active === true || await checkProAccessLive(session);
    if (!hasPro) {
      // 402 (bukan 429) - lihat catatan yang sama di app/api/breakout-radar/route.ts.
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const today = new Date().toISOString().split('T')[0];

    // Snapshot fundamental ringan (lihat getFundamentalSnapshot) - dipakai membangun
    // cache key, BUKAN cuma tanggal kalender, supaya laporan keuangan baru langsung
    // membuat cache lama basi tanpa menunggu hari berikutnya.
    const fundamentalSnapshot = await getFundamentalSnapshot(symbol);
    const cacheKey = `${today}:${fundamentalSnapshot?.mostRecentQuarter || 'na'}`;

    // Check Cache First
    const cached = await getCouncilCache(symbol, cacheKey);
    if (cached) {
      const response = NextResponse.json(cached);
      if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
      return response;
    }

    // Ambil data teknikal dari yfinance
    const technicalData = await getTechnicalData(symbol);
    if (!technicalData) {
      const response = NextResponse.json(runLocalCouncil(symbol, { price: 0, fundamentalSnapshot }), { status: 200 });
      if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
      return response;
    }
    (technicalData as any).fundamentalSnapshot = fundamentalSnapshot;

    // Skor komposit REAL (bukan mock) - reuse scoring engine yang sama dipakai
    // Technical Analyzer (modules/technical/service/scoring.service.ts), dari data
    // teknikal+fundamental+flow yang barusan dihitung di atas.
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
      },
      {
        per: fundamentalSnapshot?.per ?? null,
        pbv: fundamentalSnapshot?.pbv ?? null,
        roe: fundamentalSnapshot?.roe ?? null,
        der: fundamentalSnapshot?.der ?? null,
        currentRatio: fundamentalSnapshot?.currentRatio ?? null,
        revenueGrowth: fundamentalSnapshot?.revenueGrowth ?? null,
      },
      {
        foreignFlow: technicalData.foreignFlow,
        consecutiveBuyDays: technicalData.consecutiveBuyDays,
        consecutiveSellDays: technicalData.consecutiveSellDays,
        volRatio: technicalData.volRatio,
      }
    );
    (technicalData as any).score = scoringResult.total_score;

    try {
      // Run Gemini API via getCouncil (handles caching and fallback internally)
      const council = await getCouncil(symbol, technicalData, cacheKey);
      const response = NextResponse.json(council);
      if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
      return response;
    } catch (e) {
      console.warn("Gemini API failed, using local fallback", e);
      const response = NextResponse.json(runLocalCouncil(symbol, technicalData));
      if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
      return response;
    }
  } catch (e: any) {
    console.error('Council API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
