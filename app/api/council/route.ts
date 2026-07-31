import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getCouncil } from '@/lib/agents/councilFinal';
import { runLocalCouncil } from '@/lib/agents/localCouncil';
import { getCouncilCache, setCouncilCache } from '@/lib/cache';
import { getSession, checkProAccess } from '@/modules/user';

// Minimal technical analyzer functions from existing codebase
import { analyze as analyzeEma } from '@/lib/analyzers/ema-analyzer';
import { analyze as analyzeRsi } from '@/lib/analyzers/rsi-analyzer';
import { analyze as analyzeMacd } from '@/lib/analyzers/macd-analyzer';
import { analyze as analyzeSupport } from '@/lib/analyzers/support-resistance';
import { analyze as analyzeSma } from '@/lib/analyzers/moving-average';
import { analyze as analyzeTrend } from '@/lib/analyzers/trend-analyzer';

async function getTechnicalData(ticker: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
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

    if (history.length === 0) return null;

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
    
    // Check Cache First
    const cached = await getCouncilCache(symbol, today);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Ambil data teknikal dari yfinance
    const technicalData = await getTechnicalData(symbol);
    if (!technicalData) {
      return NextResponse.json(runLocalCouncil(symbol, { price: 0 }), { status: 200 });
    }

    try {
      // Run Gemini API via getCouncil (handles caching and fallback internally)
      const council = await getCouncil(symbol, technicalData);
      return NextResponse.json(council);
    } catch (e) {
      console.warn("Gemini API failed, using local fallback", e);
      return NextResponse.json(runLocalCouncil(symbol, technicalData));
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
  }
}
