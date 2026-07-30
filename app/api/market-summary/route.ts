import { NextResponse } from 'next/server';

// Top IDX stocks for public market summary
const MARKET_STOCKS = [
  'BBCA.JK','BBRI.JK','BMRI.JK','BBNI.JK','TLKM.JK','ASII.JK','GOTO.JK','ADRO.JK','UNTR.JK',
  'ICBP.JK','KLBF.JK','PGAS.JK','PTBA.JK','ANTM.JK','BRPT.JK','INKP.JK','INDF.JK','ITMG.JK',
  'CPIN.JK','UNVR.JK','AKRA.JK','BRIS.JK','SMGR.JK','INTP.JK','CTRA.JK','BSDE.JK','SMRA.JK',
  'ISAT.JK','EXCL.JK','BUKA.JK','TOWR.JK','TBIG.JK','SIDO.JK','AMRT.JK','MYOR.JK','HMSP.JK',
  'GGRM.JK','JPFA.JK','ARTO.JK','BDMN.JK','BNGA.JK','BBTN.JK','MEGA.JK','INDY.JK','BYAN.JK',
  'HRUM.JK','INCO.JK','TINS.JK','MAPI.JK','SILO.JK','EMTK.JK','WIKA.JK','ADHI.JK','PWON.JK',
];

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

async function fetchQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3mo&interval=1d`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 300 }, // cache 5 menit
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};

    const closes: number[] = [];
    const volumes: number[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close?.[i] !== null && quote.close?.[i] !== undefined) {
        closes.push(quote.close[i]);
        volumes.push(quote.volume?.[i] || 0);
      }
    }
    if (closes.length < 5) return null;

    // NOTE: meta.chartPreviousClose is unreliable for ranges other than 1d — Yahoo
    // returns the close from the *start* of the requested range, not yesterday's close.
    // Always derive prevClose from the actual daily closes we just fetched.
    const prevClose = closes[closes.length - 2] || closes[0];
    const currentPrice = meta.regularMarketPrice || closes[closes.length - 1];
    const changePct = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;
    const volume = meta.regularMarketVolume || volumes[volumes.length - 1] || 0;

    const weekAgoClose = closes.length >= 6 ? closes[closes.length - 6] : closes[0];
    const weeklyChangePct = weekAgoClose ? ((currentPrice - weekAgoClose) / weekAgoClose) * 100 : 0;

    const ma20 = sma(closes, 20);
    const ma50 = sma(closes, 50);
    const rsi14 = rsi(closes, 14);
    const avgVolume20 = volumes.length >= 20
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
      : (volumes.reduce((a, b) => a + b, 0) / (volumes.length || 1));
    const volRatio = avgVolume20 ? volume / avgVolume20 : 1;

    let technicalSignal: 'BULLISH' | 'BEARISH' | 'NETRAL' = 'NETRAL';
    let technicalScore = 0;
    if (ma20 !== null && ma50 !== null) {
      const conditions = [currentPrice > ma20, ma20 > ma50, volRatio > 1];
      const met = conditions.filter(Boolean).length;
      technicalScore = Math.round((met / conditions.length) * 100);
      if (currentPrice > ma20 && ma20 > ma50) technicalSignal = 'BULLISH';
      else if (currentPrice < ma20 && ma20 < ma50) technicalSignal = 'BEARISH';
    }

    return {
      symbol,
      price: currentPrice,
      changePct: parseFloat(changePct.toFixed(2)),
      weeklyChangePct: parseFloat(weeklyChangePct.toFixed(2)),
      volume,
      value: volume * currentPrice,
      ma20, ma50, rsi14,
      technicalSignal,
      technicalScore,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // Fetch in chunks of 10 parallel
    const quotes: any[] = [];
    for (let i = 0; i < MARKET_STOCKS.length; i += 10) {
      const chunk = MARKET_STOCKS.slice(i, i + 10);
      const results = await Promise.all(chunk.map(s => fetchQuote(s)));
      results.forEach(r => { if (r) quotes.push(r); });
    }

    const strip = (s: any) => s.symbol.replace('.JK', '');

    const topGainers = [...quotes].sort((a, b) => b.changePct - a.changePct).slice(0, 10).map(s => ({
      symbol: strip(s), changePct: s.changePct, price: s.price
    }));

    const topLosers = [...quotes].sort((a, b) => a.changePct - b.changePct).slice(0, 10).map(s => ({
      symbol: strip(s), changePct: s.changePct, price: s.price
    }));

    const topVolume = [...quotes].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 10).map(s => ({
      symbol: strip(s), volume: s.volume || 0, price: s.price
    }));

    const topValue = [...quotes].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 10).map(s => ({
      symbol: strip(s), value: s.value || 0, price: s.price
    }));

    const topWeeklyGainers = [...quotes].sort((a, b) => b.weeklyChangePct - a.weeklyChangePct).slice(0, 10).map(s => ({
      symbol: strip(s), changePct: s.weeklyChangePct, price: s.price
    }));

    const topWeeklyLosers = [...quotes].sort((a, b) => a.weeklyChangePct - b.weeklyChangePct).slice(0, 10).map(s => ({
      symbol: strip(s), changePct: s.weeklyChangePct, price: s.price
    }));

    const topTechnical = [...quotes]
      .filter(s => s.technicalSignal === 'BULLISH')
      .sort((a, b) => (b.technicalScore - a.technicalScore) || (b.changePct - a.changePct))
      .slice(0, 10)
      .map(s => ({ symbol: strip(s), score: s.technicalScore, changePct: s.changePct, price: s.price }));

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      topGainers,
      topLosers,
      topVolume,
      topValue,
      topWeeklyGainers,
      topWeeklyLosers,
      topTechnical,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
