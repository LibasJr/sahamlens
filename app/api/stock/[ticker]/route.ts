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

export async function GET(
  request: Request,
  { params }: { params: { ticker: string } }
) {
  try {
    let ticker = params.ticker.toUpperCase();
    if (!ticker.includes('.')) {
      ticker = `${ticker}.JK`;
    }

    // Fetch Yahoo Finance data
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch Yahoo data' }, { status: 500 });
    }

    const data = await res.json();
    const result = data.chart.result?.[0];
    if (!result) {
      return NextResponse.json({ error: 'No data found' }, { status: 404 });
    }

    const currentPrice = result.meta.regularMarketPrice;
    
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

    // Run all 10 analyzers
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
    let bestPerformer = analyzersResult[0];

    analyzersResult.forEach(res => {
      if (res.decision === 'BULLISH') bullish++;
      else if (res.decision === 'BEARISH') bearish++;

      if (res.confidence > bestPerformer.confidence) {
        bestPerformer = res;
      }
    });

    const totalVotes = bullish + bearish;
    let consensus = 'NEUTRAL';
    
    if (totalVotes > 0) {
      const bullPct = (bullish / totalVotes) * 100;
      if (bullPct >= 60) consensus = `BULLISH ${bullPct.toFixed(0)}%`;
      else if (bullPct <= 40) consensus = `BEARISH ${(100 - bullPct).toFixed(0)}%`;
    }

    return NextResponse.json({
      ticker,
      price: currentPrice,
      analyzers: analyzersResult,
      consensus,
      bestPerformer,
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
      technical: {} // placeholder to prevent errors
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
