import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';
import { getCouncil, runLocalCouncil, getCouncilCache } from '@/modules/ai';
import { getSession, checkProAccessLive } from '@/modules/user';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

// BUG FIX (2026-08-05, diagnostik log produksi): tanpa ini, function terikat default
// Vercel Hobby plan (10 detik) - generateAI() (lib/aiProviders.ts) mencoba cascade sampai
// 6 kombinasi provider+model, masing-masing timeout 8 detik, jadi skenario terburuknya
// ~48 detik. Log produksi menunjukkan sebagian permintaan cuma sempat mencatat 2-3
// percobaan sebelum function dimatikan platform - bukan semua provider benar-benar
// dicoba sebelum jatuh ke fallback lokal. Nilai 60 sama seperti app/api/screener/
// route.ts (pola yang sama, sudah terbukti jalan di plan yang sama).
export const maxDuration = 60;

// Minimal technical analyzer functions from existing codebase
import {
  analyzeEma,
  analyzeRsi,
  analyzeMacd,
  analyzeVolatility,
  fetchYahooHistory,
  calculateScore,
} from '@/modules/technical';
import { computeDailyNetFlow, computeAccumulationStreak, analyzeAccumulationSignal, analyzeBandarmology } from '@/modules/market';

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

    const volToday = history[history.length - 1]?.Volume || 0;
    const volAvg20 = history.slice(-20).reduce((s, h) => s + h.Volume, 0) / Math.min(20, history.length);

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
      volToday,
      volAvg20,
      volRatio: volAvg20 > 0 ? volToday / volAvg20 : null,
      foreignFlow: foreignFlowStatus,
      cmf20: bandarmology.cmf20,
      accumulationStatus: accumulation.status,
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
      // BUG FIX (audit logika & algoritma 2026-08-05, temuan C-5): cabang ini SEBELUMNYA
      // memanggil runLocalCouncil(symbol, { price: 0 }) dan mengembalikannya dengan HTTP
      // 200 - sepuluh "agen" lengkap dengan sinyal, di mana Trend Follower menyatakan
      // "SELL - Harga < MA200" semata karena 0 > 0 bernilai false, dan Mean Reversion
      // melaporkan "RSI 50.00" dari nilai default. Kegagalan mengambil data disajikan
      // sebagai analisa yang tidak bisa dibedakan pengguna dari analisa sungguhan.
      // Sekarang gagal secara jujur.
      const response = NextResponse.json(
        {
          error: 'Data harga tidak tersedia',
          code: 'MARKET_DATA_UNAVAILABLE',
          detail: `Histori harga ${symbol} tidak bisa diambil dari sumber data saat ini, jadi analisa tidak dihitung. Coba lagi beberapa saat lagi.`,
        },
        { status: 503 }
      );
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
        // BUG FIX (audit 2026-08-05, temuan M-1 + H-1): `cmf20` dan `accumulationStatus`
        // SEBELUMNYA tidak dikirim sama sekali dari sini, sehingga skor komposit Council
        // dihitung dengan komponen arus dana yang berbeda dari Detail Saham/Screener -
        // saham yang sama bisa punya dua skor berbeda tanpa alasan data. Sekarang input
        // kelompok Flow identik dengan pemanggil lain.
        cmf20: technicalData.cmf20,
        accumulationStatus: technicalData.accumulationStatus,
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
