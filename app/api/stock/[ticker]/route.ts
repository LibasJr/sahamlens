import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import {
  analyzeEma,
  analyzeRsi,
  analyzeMacd,
  analyzeVolume,
  analyzeTrend,
  analyzeVolatility,
  analyzeMomentum,
  analyzeSupport,
  analyzeSma,
  analyzeMarketFlow,
  calculateScore,
  calculateConsensus,
} from '@/modules/technical';
import { getSession, checkProAccess } from '@/modules/user';
import { computeDailyNetFlow, computeAccumulationStreak } from '@/modules/market';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { recordAnalisaHit } from '@/lib/serverStats';
import { cacheGet, cacheSet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC as TTL } from '@/shared/cache/ttl-policy';
import YahooFinanceClass from 'yahoo-finance2';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

// Redis (Cache Layer Tier 2 Technical), bukan lagi Map in-memory - temuan H3/M10
// lama: Map per-instance tidak konsisten lintas instance serverless dan tidak
// pernah membersihkan entry basi (memory leak lambat). Kalau Redis belum
// dikonfigurasi / sedang down, cacheGet/cacheSet degrade aman ke cache-miss/no-op
// (lihat shared/cache/redis-cache.ts) - endpoint tetap jalan, cuma tanpa cache.
const CACHE_TTL_SEC = TTL.TECHNICAL;

export async function GET(
  request: Request,
  { params }: { params: { ticker: string } }
) {
  try {
    const isInternal = isInternalServiceRequest(request);
    const session = isInternal ? null : await getSession();
    if (!isInternal && !session) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }

    const hasPro = isInternal ? true : checkProAccess(session);
    if (!hasPro) {
      // 402 (bukan 429) - lihat catatan yang sama di app/api/breakout-radar/route.ts.
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }
    let ticker = params.ticker.toUpperCase();
    if (!ticker.includes('.')) {
      ticker = `${ticker}.JK`;
    }

    if (!isInternal) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
        || request.headers.get('x-real-ip')
        || 'unknown';
      recordAnalisaHit(ip, ticker);
    }

    // Parameter range OPSIONAL (Performance Roadmap Fase 2 poin 7, samakan pola
    // dengan public-chart/[ticker]) - default TETAP 20y kalau tidak diisi, supaya
    // caller lama (dashboard/portfolio yang belum kirim ?range=) tidak berubah
    // perilakunya. Caller baru bisa minta rentang lebih kecil = payload lebih kecil.
    const ALLOWED_RANGES = new Set(['1mo', '3mo', '6mo', '1y', '3y', '5y', '20y']);
    const requestUrl = new URL(request.url);
    const rangeParam = requestUrl.searchParams.get('range');
    const range = rangeParam && ALLOWED_RANGES.has(rangeParam) ? rangeParam : '20y';

    const cacheKey = `sahamlens:cache:computed:technical:${ticker}:${range}`;
    // Key kedua, TTL jauh lebih panjang - HANYA dibaca kalau fetch Yahoo gagal
    // (lihat blok catch di bawah). Mempertahankan perilaku lama: lebih baik
    // sajikan data basi (bisa >3 menit) daripada error keras saat Yahoo down,
    // yang hilang kalau cuma mengandalkan TTL pendek cacheKey di atas.
    const staleFallbackKey = `sahamlens:cache:computed:technical-stale-fallback:${ticker}:${range}`;

    const cached = await cacheGet<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=1d`;
    
    // Add timeout to prevent infinite spinning if Yahoo hangs
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const chartPromise = fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      signal: controller.signal
    }).then(res => {
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error('Failed to fetch Yahoo data');
      return res.json();
    }).catch((e: any) => {
      clearTimeout(timeoutId);
      throw e;
    });

    const quotePromise = Promise.race([
      yahooFinance.quoteSummary(ticker, {
        modules: ['defaultKeyStatistics', 'financialData', 'summaryDetail']
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('quoteSummary timeout')), 8000))
    ]).catch((e: any) => {
      console.warn("Failed to fetch fundamental data for scoring:", e);
      return null;
    });

    let data, quoteSummary;
    try {
      [data, quoteSummary] = await Promise.all([chartPromise, quotePromise]);
    } catch (error) {
      const stale = await cacheGet<any>(staleFallbackKey);
      if (stale) {
        console.warn(`yfinance fetch failed, returning stale fallback cache for ${ticker}`);
        return NextResponse.json(stale);
      }
      return NextResponse.json({ error: 'Failed to fetch Yahoo data' }, { status: 500 });
    }

    const result = data.chart.result?.[0];
    if (!result) {
      return NextResponse.json({ error: 'No data found' }, { status: 404 });
    }

    const currentPrice = result.meta.regularMarketPrice;
    
    // Extract Fundamental Data
    let per = null, pbv = null, roe = null, der = null, currentRatio = null, revenueGrowth = null;
    if (quoteSummary) {
      per = quoteSummary.summaryDetail?.trailingPE || quoteSummary.summaryDetail?.forwardPE || null;
      pbv = quoteSummary.defaultKeyStatistics?.priceToBook || null;
      roe = quoteSummary.financialData?.returnOnEquity || null;
      der = quoteSummary.financialData?.debtToEquity || null;
      currentRatio = quoteSummary.financialData?.currentRatio || null;
      revenueGrowth = quoteSummary.financialData?.revenueGrowth || null;
    }
    
    const timestamps = result.timestamp || [];
    const quote = result.indicators.quote[0];
    
    // Convert to history array for analyzers
    const history = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close[i] !== null) {
        history.push({
          Date: new Date(timestamps[i] * 1000).toISOString(),
          Open: quote.open[i],
          High: quote.high[i],
          Low: quote.low[i],
          Close: quote.close[i],
          Volume: quote.volume[i]
        });
      }
    }

    // Window 200 hari terakhir untuk analyzer/scoring (Performance Roadmap Fase 2
    // poin 6) - indikator standar (RSI/MACD/EMA/dst.) tidak butuh histori 20 tahun
    // penuh, cukup ~200 hari. `history` PENUH tetap dipakai apa adanya untuk
    // `stock.history` di response (data chart, beda kebutuhan dari analyzer).
    const ANALYZER_HISTORY_DAYS = 200;
    const analyzerHistory = history.slice(-ANALYZER_HISTORY_DAYS);

    // Run all 10 analyzers
    const analyzersResult = await Promise.all([
      Promise.resolve(analyzeEma(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeRsi(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeMacd(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeVolume(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeTrend(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeVolatility(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeMomentum(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeSupport(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeSma(analyzerHistory, currentPrice)),
      Promise.resolve(analyzeMarketFlow(analyzerHistory, currentPrice))
    ]);

    // === FOREIGN FLOW (ESTIMASI): proxy dari harga+volume Yahoo Finance yang REAL ===
    // Sebelumnya seedRandom(ticker) murni - angka yang SELALU SAMA untuk ticker yang
    // sama, tidak pernah mencerminkan pergerakan pasar (ditemukan saat audit dummy-data
    // 2026-08-01, pola identik dengan yang sudah diperbaiki di app/api/flow/[ticker]).
    // IDX tidak menyediakan feed broker asing gratis, jadi ini tetap PROXY (bukan data
    // broker sungguhan) - dihitung dari computeDailyNetFlow (modules/market), sama
    // seperti /api/flow/[ticker] dan kategori "Akumulasi Asing" di AI Pick, supaya
    // ketiga fitur konsisten satu sama lain.
    const flowHistory = analyzerHistory.map((h: any) => ({
      date: h.Date.split('T')[0],
      close: h.Close,
      volume: h.Volume,
    }));
    const dailyFlow = computeDailyNetFlow(flowHistory).slice(-20);
    const net5D = dailyFlow.slice(-5).reduce((sum, d) => sum + d.netValueBillion, 0);
    const buyStreak = computeAccumulationStreak(dailyFlow);
    let sellStreak = 0;
    for (let i = dailyFlow.length - 1; i >= 0; i--) {
      if (dailyFlow[i].netValueBillion < 0) sellStreak++;
      else break;
    }
    const last3 = dailyFlow.slice(-3);
    const isAccumulation3D = last3.length === 3 && last3.every((d) => d.netValueBillion > 0);
    const isDistribution3D = last3.length === 3 && last3.every((d) => d.netValueBillion < 0);

    // Status kanonik dikonsumsi calculateScore (FlowInput.foreignFlow) - lihat
    // modules/technical/service/scoring.service.ts untuk 5 nilai yang diharapkan.
    let foreignFlowStatus: 'STRONG NET BUY' | 'NET BUY' | 'NEUTRAL' | 'NET SELL' | 'STRONG NET SELL' = 'NEUTRAL';
    let ffDecision = 'NEUTRAL';
    let ffConfidence = 50;
    if (isAccumulation3D) {
      foreignFlowStatus = buyStreak >= 4 ? 'STRONG NET BUY' : 'NET BUY';
      ffDecision = 'BULLISH';
      ffConfidence = buyStreak >= 4 ? 80 : 65;
    } else if (isDistribution3D) {
      foreignFlowStatus = sellStreak >= 4 ? 'STRONG NET SELL' : 'NET SELL';
      ffDecision = 'BEARISH';
      ffConfidence = sellStreak >= 4 ? 80 : 65;
    }
    const foreignFlow = `${foreignFlowStatus} | Net 5D: ${net5D >= 0 ? '+' : ''}${net5D.toFixed(2)}M | Streak: ${buyStreak > 0 ? `${buyStreak}D akumulasi` : sellStreak > 0 ? `${sellStreak}D distribusi` : 'netral'}`;

    const consecutiveBuyDays = buyStreak;
    const consecutiveSellDays = sellStreak;

    analyzersResult.push({
      label: 'Foreign Flow (Estimasi Asing)',
      value: foreignFlow,
      decision: ffDecision,
      confidence: ffConfidence
    });

    let bullish = 0;
    let bearish = 0;
    let bestPerformer = analyzersResult[0];

    analyzersResult.forEach(res => {
      if (res.decision === 'BULLISH') bullish++;
      else if (res.decision === 'BEARISH') bearish++;

      if (res.confidence > bestPerformer.confidence) {
        bestPerformer = res;
      }
    });

    const totalVotes = bullish + bearish;
    
    // === CONSENSUS ENGINE: Median + Voting ===
    const consensusData = calculateConsensus(analyzersResult);
    const consensus = consensusData.konsensus;

    // === SCORING ENGINE: Hitung skor komposit 0-100 ===
    const closes = analyzerHistory.map(h => h.Close);
    const sum20 = closes.slice(-20).reduce((a, b) => a + b, 0);
    const sum50 = closes.slice(-50).reduce((a, b) => a + b, 0);
    const sum200 = closes.slice(-Math.min(200, closes.length)).reduce((a, b) => a + b, 0);
    const ma20 = sum20 / Math.min(20, closes.length);
    const ma50 = sum50 / Math.min(50, closes.length);
    const ma200v = sum200 / Math.min(200, closes.length);

    // Extract RSI value from analyzer output
    const rsiResult = analyzersResult.find((r: any) => r.label?.includes('RSI'));
    const rsiVal = rsiResult ? parseFloat(rsiResult.value?.replace('RSI: ', '') || '50') : 50;

    // Extract MACD values from analyzer output
    const macdResult = analyzersResult.find((r: any) => r.label?.includes('MACD'));
    let macdLineVal = 0, macdSigVal = 0, macdHistVal = 0;
    if (macdResult?.value) {
      const macdMatch = macdResult.value.match(/MACD: ([\-\d.]+), Sig: ([\-\d.]+), Hist: ([\-\d.]+)/);
      if (macdMatch) {
        macdLineVal = parseFloat(macdMatch[1]);
        macdSigVal = parseFloat(macdMatch[2]);
        macdHistVal = parseFloat(macdMatch[3]);
      }
    }

    const volToday = analyzerHistory[analyzerHistory.length - 1]?.Volume || 0;
    const volAvg20v = analyzerHistory.slice(-20).reduce((s, h) => s + h.Volume, 0) / Math.min(20, analyzerHistory.length);

    const scoringResult = calculateScore(
      ticker,
      {
        currentPrice,
        ma20,
        ma50,
        ma200: ma200v,
        rsi: rsiVal,
        macdHist: macdHistVal,
        macdLine: macdLineVal,
        macdSignal: macdSigVal,
        volToday,
        volAvg20: volAvg20v
      },
      { per, pbv, roe, der, currentRatio, revenueGrowth },
      { foreignFlow: foreignFlowStatus, consecutiveBuyDays, consecutiveSellDays, volRatio: volAvg20v > 0 ? volToday / volAvg20v : 1 }
    );

    const resultPayload = {
      ticker,
      price: currentPrice,
      analyzers: analyzersResult,
      consensus,
      consensusData,
      bestPerformer,
      scoring: scoringResult,
      stock: {
        symbol: ticker,
        current_price: currentPrice,
        change_pct: quote.close[quote.close.length - 1] && quote.close[quote.close.length - 2] ? 
          parseFloat((((quote.close[quote.close.length - 1] - quote.close[quote.close.length - 2]) / quote.close[quote.close.length - 2]) * 100).toFixed(2)) : 0,
        volume: quote.volume[quote.volume.length - 1] || 0,
        history: history.map(h => ({
          time: h.Date.split('T')[0],
          open: h.Open,
          high: h.High,
          low: h.Low,
          close: h.Close,
          volume: h.Volume
        }))
      },
      technical: {}
    };

    if (!hasPro && !cached && session) {
      // Free users decrement logic can be added here if implemented
    }

    await cacheSet(cacheKey, resultPayload, CACHE_TTL_SEC);
    await cacheSet(staleFallbackKey, resultPayload, TTL.STALE_FALLBACK);

    return NextResponse.json(resultPayload);

  } catch (error: any) {
    console.error('Stock API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
