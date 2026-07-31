import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';
import { getSession, checkProAccess } from '@/modules/user';
import { checkAnalisaLimit } from '@/lib/limits';
const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });
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

async function analyzeStock(ticker: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      signal: controller.signal
    }).catch(e => {
      clearTimeout(timeoutId);
      throw e;
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;

    const data = await res.json();
    const result = data.chart.result?.[0];
    if (!result) return null;

    const currentPrice = result.meta.regularMarketPrice;
    const timestamps = result.timestamp || [];
    const quote = result.indicators.quote[0];
    
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

    if (history.length < 30) return null; 

    const analyzersResult = await Promise.all([
      Promise.resolve(analyzeEma(history, currentPrice)),
      Promise.resolve(analyzeRsi(history, currentPrice)),
      Promise.resolve(analyzeMacd(history, currentPrice)),
      Promise.resolve(analyzeVolume(history, currentPrice)),
      Promise.resolve(analyzeTrend(history, currentPrice)),
      Promise.resolve(analyzeVolatility(history, currentPrice)),
      Promise.resolve(analyzeMomentum(history, currentPrice)),
      Promise.resolve(analyzeSupport(history, currentPrice)),
      Promise.resolve(analyzeSma(history, currentPrice)),
      Promise.resolve(analyzeMarketFlow(history, currentPrice))
    ]);

    let bullish = 0;
    let bearish = 0;

    analyzersResult.forEach(res => {
      if (res.decision === 'BULLISH') bullish++;
      else if (res.decision === 'BEARISH') bearish++;
    });

    const totalVotes = bullish + bearish;
    let consensus = 'NEUTRAL';
    let confidence = 0;
    
    if (totalVotes > 0) {
      const bullPct = (bullish / totalVotes) * 100;
      if (bullPct >= 70) { consensus = 'STRONG BUY'; confidence = bullPct; }
      else if (bullPct >= 50) { consensus = 'BUY'; confidence = bullPct; }
      else if (bullPct <= 30) { consensus = 'STRONG SELL'; confidence = 100 - bullPct; }
      else if (bullPct <= 50) { consensus = 'SELL'; confidence = 100 - bullPct; }
      else { consensus = 'HOLD'; confidence = Math.max(bullPct, 100 - bullPct); }
    }
    
    const prevClose = quote.close[quote.close.length - 2];
    const changePct = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;
    const volume = quote.volume[quote.volume.length - 1] || 0;
    
    const sentimentScore = Math.min(100, Math.max(0, 50 + (changePct * 3) + (bullish - bearish) * 2.5));
    let sentimentLabel = 'Neutral';
    if (sentimentScore >= 70) sentimentLabel = 'Sangat Positif';
    else if (sentimentScore >= 55) sentimentLabel = 'Positif';
    else if (sentimentScore <= 30) sentimentLabel = 'Sangat Negatif';
    else if (sentimentScore <= 45) sentimentLabel = 'Negatif';

    // Bandar Flow Logic Override for Sentiment
    const cleanTicker = ticker.replace('.JK', '');
    let h = 0xdeadbeef;
    for (let i = 0; i < cleanTicker.length; i++) h = Math.imul(h ^ cleanTicker.charCodeAt(i), 2654435761);
    const rand1 = (h ^ h >>> 16) / 2 ** 32 + 0.5;
    
    // Simulate 5D net flow based on random seed
    let net5D = 0;
    for(let i=0; i<5; i++) {
      let h2 = 0xdeadbeef;
      const seedStr = cleanTicker + 'flow' + (19 - i);
      for (let j = 0; j < seedStr.length; j++) h2 = Math.imul(h2 ^ seedStr.charCodeAt(j), 2654435761);
      net5D += ((h2 ^ h2 >>> 16) / 2 ** 32 + 0.5 - 0.5) * 100;
    }
    
    const isOverallPositive = rand1 > 0.4;
    const volBuy = (Math.floor(rand1 * 500000) + 100000) + (Math.floor(rand1 * 300000) + 50000) + (Math.floor(rand1 * 200000) + 20000);
    const volSell = (Math.floor(rand1 * 450000) + 80000) + (Math.floor(rand1 * 250000) + 40000) + (Math.floor(rand1 * 150000) + 10000);
    
    const adjustedBuy = isOverallPositive ? volBuy : Math.floor(volSell * 0.7);
    const adjustedSell = isOverallPositive ? Math.floor(volBuy * 0.7) : volSell;
    
    if (net5D > 0 && adjustedBuy > adjustedSell * 1.1) {
      sentimentLabel = 'Sangat Positif';
    } else if (net5D < 0 && adjustedSell > adjustedBuy * 1.1) {
      sentimentLabel = 'Sangat Negatif';
    }

    const avgVolume = history.reduce((sum, h) => sum + h.Volume, 0) / history.length;
    const volRatio = volume / (avgVolume || 1);
    
    let foreignFlow = 'NEUTRAL';
    if (changePct > 0.5 && volRatio > 1.2) foreignFlow = 'STRONG NET BUY';
    else if (changePct > 0) foreignFlow = 'NET BUY';
    else if (changePct < -0.5 && volRatio > 1.2) foreignFlow = 'STRONG NET SELL';
    else if (changePct < 0) foreignFlow = 'NET SELL';

    let sector = 'Umum';
    try {
      const quoteSummary = await yahooFinance.quoteSummary(ticker, { modules: ['assetProfile'] });
      if (quoteSummary?.assetProfile?.sector) {
        sector = quoteSummary.assetProfile.sector;
      }
    } catch (err) {
      // Ignore errors to not break the whole recommendation scan
    }

    return {
      ticker: ticker.replace('.JK', ''),
      sector: sector,
      price: currentPrice,
      changePct: parseFloat(changePct.toFixed(2)),
      volume: volume,
      consensus,
      confidence: parseFloat(confidence.toFixed(0)),
      bullishVotes: bullish,
      bearishVotes: bearish,
      sentimentScore: parseFloat(sentimentScore.toFixed(0)),
      sentimentLabel,
      foreignFlow
    };
  } catch (e) {
    return null;
  }
}

export async function GET(request: Request) {
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

    const url = new URL(request.url);
    const symbolsParam = url.searchParams.get('symbols');
    const symbols = symbolsParam ? symbolsParam.split(',') : ['BBCA.JK'];

    const results = [];
    const chunkSize = 5;
    for (let i = 0; i < symbols.length; i += chunkSize) {
      const chunk = symbols.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(chunk.map(t => analyzeStock(t)));
      results.push(...chunkResults.filter(Boolean));
    }
    
    return NextResponse.json({ recommendations: results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
