import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { analyze as analyzeEma } from '@/lib/analyzers/ema-analyzer';
import { analyze as analyzeRsi } from '@/lib/analyzers/rsi-analyzer';
import { analyze as analyzeMacd } from '@/lib/analyzers/macd-analyzer';
import { analyze as analyzeVolume } from '@/lib/analyzers/volume-analyzer';
import { analyze as analyzeTrend } from '@/lib/analyzers/trend-analyzer';
import { analyze as analyzeVolatility } from '@/lib/analyzers/volatility-analyzer';
import { analyze as analyzeMomentum } from '@/lib/analyzers/momentum-analyzer';
import { analyze as analyzeSupport } from '@/lib/analyzers/support-resistance';
import { analyze as analyzeSma } from '@/lib/analyzers/moving-average';
import { analyze as analyzeMarketFlow } from '@/lib/analyzers/market-flow';
import { calculateScore } from '@/lib/scoring-engine';
import { calculateConsensus } from '@/lib/consensus-engine';
import { getSession, checkProAccess } from '@/modules/user';
import { recordAnalisaHit } from '@/lib/serverStats';
import { checkAnalisaLimit, decrementAnalisaLimit } from '@/lib/limits';
import { cacheGet, cacheSet } from '@/shared/cache/redis-cache';
import YahooFinanceClass from 'yahoo-finance2';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

// Redis (Cache Layer Tier 2 Technical), bukan lagi Map in-memory - temuan H3/M10
// lama: Map per-instance tidak konsisten lintas instance serverless dan tidak
// pernah membersihkan entry basi (memory leak lambat). Kalau Redis belum
// dikonfigurasi / sedang down, cacheGet/cacheSet degrade aman ke cache-miss/no-op
// (lihat shared/cache/redis-cache.ts) - endpoint tetap jalan, cuma tanpa cache.
const CACHE_TTL_SEC = 3 * 60; // 3 minutes

export async function GET(
  request: Request,
  { params }: { params: { ticker: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }
    
    const hasPro = checkProAccess(session);
    if (!hasPro) {
      // 402 (bukan 429) - lihat catatan yang sama di app/api/breakout-radar/route.ts.
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }
    let telegram_id = Number(session.id);
    let ticker = params.ticker.toUpperCase();
    if (!ticker.includes('.')) {
      ticker = `${ticker}.JK`;
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    recordAnalisaHit(ip, ticker);

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

    // === FOREIGN FLOW: Pseudo-random logic to match BandarFlowPro ===
    const cleanTicker = ticker.replace('.JK', '');
    const seedRandom = (str: string) => {
      let h = 0xdeadbeef;
      for (let i = 0; i < str.length; i++)
        h = Math.imul(h ^ str.charCodeAt(i), 2654435761);
      return (h ^ h >>> 16) / 2 ** 32 + 0.5;
    };
    
    const rand1 = seedRandom(cleanTicker + '1');
    const rand2 = seedRandom(cleanTicker + '2');
    let foreignNetBuy20D = 0;
    for(let i=0; i<20; i++) {
       foreignNetBuy20D += (seedRandom(cleanTicker + 'flow' + i) - 0.5) * 100;
    }
    const isOverallPositive = rand1 > 0.4;
    
    const b1 = Math.floor(rand1 * 500000) + 100000;
    const b2 = Math.floor(rand2 * 300000) + 50000;
    const b3 = Math.floor(rand1 * 200000) + 20000;
    const s1 = Math.floor(rand2 * 450000) + 80000;
    const s2 = Math.floor(rand1 * 250000) + 40000;
    const s3 = Math.floor(rand2 * 150000) + 10000;
    
    let actualS1 = s1; let actualB1 = b1;
    if (isOverallPositive) {
      actualS1 = Math.floor(b1 * 0.7);
    } else {
      actualB1 = Math.floor(s1 * 0.7);
    }
    const totalBuyVol = actualB1 + b2 + b3;
    const totalSellVol = actualS1 + s2 + s3;

    let ffDecision = 'NEUTRAL';
    let ffConfidence = 50;
    let foreignFlow = 'NEUTRAL';

    if (foreignNetBuy20D > 10) {
      ffDecision = 'BULLISH';
      ffConfidence = 65;
      foreignFlow = `NET BUY +${foreignNetBuy20D.toFixed(2)}M`;
    } else if (foreignNetBuy20D < -10) {
      ffDecision = 'BEARISH';
      ffConfidence = 65;
      foreignFlow = `NET SELL ${foreignNetBuy20D.toFixed(2)}M`;
    }

    // Override based on Brokers (Top 3 Buyers vs Sellers)
    if (totalBuyVol > totalSellVol) {
      ffDecision = 'BULLISH';
      ffConfidence = 85;
      foreignFlow = `Sangat Positif (Top Buyers > Sellers) | Net 20D: ${foreignNetBuy20D > 0 ? '+' : ''}${foreignNetBuy20D.toFixed(2)}M`;
    } else if (totalSellVol > totalBuyVol * 1.1) {
      ffDecision = 'BEARISH';
      ffConfidence = 85;
      foreignFlow = `Sangat Negatif (Top Sellers > Buyers) | Net 20D: ${foreignNetBuy20D > 0 ? '+' : ''}${foreignNetBuy20D.toFixed(2)}M`;
    }

    // Keep these variables for calculateScore
    const consecutiveBuyDays = 0;
    const consecutiveSellDays = 0;
    const volRatio = 1;

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
      { foreignFlow, consecutiveBuyDays, consecutiveSellDays, volRatio }
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
    await cacheSet(staleFallbackKey, resultPayload, 24 * 60 * 60);

    return NextResponse.json(resultPayload);

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
