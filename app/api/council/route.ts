import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';
import { getCouncil, runLocalCouncil, getCouncilCache } from '@/modules/ai';
import { getSession, checkProAccess } from '@/modules/user';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

// Minimal technical analyzer functions from existing codebase
import {
  analyzeEma,
  analyzeRsi,
  analyzeMacd,
  analyzeSupport,
  analyzeSma,
  analyzeTrend,
  fetchYahooHistory,
} from '@/modules/technical';

// BUILD 009 (Performance) - fetch+parse OHLC dipindah ke modules/technical/service/
// yahoo-history.service.ts (sebelumnya diduplikasi persis di sini dan di
// modules/ai/service/orchestrator.service.ts). Logika di bawah (analyzer + MA
// khusus kebutuhan council) TIDAK diubah.
async function getTechnicalData(ticker: string) {
  try {
    const chartData = await fetchYahooHistory(ticker, '1y');
    if (!chartData) return null;
    const { history, currentPrice } = chartData;

    const closes = history.map(h => h.Close);
    const emaData = analyzeEma(history, currentPrice);
    const rsiData = analyzeRsi(history, currentPrice);
    const smaData = analyzeSma(history, currentPrice);
    const srData = analyzeSupport(history, currentPrice);
    
    const ma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, closes.length);
    const ma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / Math.min(200, closes.length);

    let support = Infinity;
    let resistance = 0;
    history.slice(-20).forEach(h => {
      if (h.Low < support) support = h.Low;
      if (h.High > resistance) resistance = h.High;
    });
    if (support === Infinity) support = 0;

    return {
      price: currentPrice,
      ma50: ma50,
      ma200: ma200,
      ema: emaData?.value || 0,
      rsi: rsiData?.value || 0,
      support: support,
      resistance: resistance,
      score: 30 // Mock score for now
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
async function getFundamentalSnapshot(ticker: string): Promise<{ mostRecentQuarter: string | null; trailingEps: number | null } | null> {
  try {
    const quoteSummary = await yahooFinance.quoteSummary(ticker, {
      modules: ['defaultKeyStatistics'],
    });
    const mrq = quoteSummary?.defaultKeyStatistics?.mostRecentQuarter;
    return {
      mostRecentQuarter: mrq ? new Date(mrq).toISOString().split('T')[0] : null,
      trailingEps: quoteSummary?.defaultKeyStatistics?.trailingEps ?? null,
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol') || 'DGWG.JK';
    
    // Check limits
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }

    const hasPro = checkProAccess(session);
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
      return NextResponse.json(cached);
    }

    // Ambil data teknikal dari yfinance
    const technicalData = await getTechnicalData(symbol);
    if (!technicalData) {
      return NextResponse.json(runLocalCouncil(symbol, { price: 0, fundamentalSnapshot }), { status: 200 });
    }
    (technicalData as any).fundamentalSnapshot = fundamentalSnapshot;

    try {
      // Run Gemini API via getCouncil (handles caching and fallback internally)
      const council = await getCouncil(symbol, technicalData, cacheKey);
      return NextResponse.json(council);
    } catch (e) {
      console.warn("Gemini API failed, using local fallback", e);
      return NextResponse.json(runLocalCouncil(symbol, technicalData));
    }
  } catch (e: any) {
    console.error('Council API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
