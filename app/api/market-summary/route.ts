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

async function fetchQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
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
    const closes = result.indicators?.quote?.[0]?.close || [];
    const validCloses = closes.filter((c: any) => c !== null);
    const prevClose = meta.chartPreviousClose || meta.previousClose || validCloses[0] || 0;
    const currentPrice = meta.regularMarketPrice || validCloses[validCloses.length - 1] || 0;
    const changePct = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;
    return {
      symbol,
      price: currentPrice,
      changePct: parseFloat(changePct.toFixed(2)),
      volume: meta.regularMarketVolume || 0,
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

    const topGainers = [...quotes].sort((a, b) => b.changePct - a.changePct).slice(0, 10).map(s => ({
      symbol: s.symbol.replace('.JK', ''),
      changePct: s.changePct,
      price: s.price
    }));

    const topLosers = [...quotes].sort((a, b) => a.changePct - b.changePct).slice(0, 10).map(s => ({
      symbol: s.symbol.replace('.JK', ''),
      changePct: s.changePct,
      price: s.price
    }));

    const topVolume = [...quotes].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 10).map(s => ({
      symbol: s.symbol.replace('.JK', ''),
      volume: s.volume || 0
    }));

    const topValue = [...quotes].sort((a, b) => ((b.volume || 0) * (b.price || 0)) - ((a.volume || 0) * (a.price || 0))).slice(0, 10).map(s => ({
      symbol: s.symbol.replace('.JK', ''),
      value: (s.volume || 0) * (s.price || 0)
    }));

    // Mock freq & foreign (tidak tersedia di yfinance publik)
    const shuffled = [...quotes].sort(() => 0.5 - Math.random());
    const topFreq = shuffled.slice(0, 10).map(s => ({
      symbol: s.symbol.replace('.JK', ''),
      freq: Math.floor(Math.random() * 50000) + 5000
    }));

    const netForeignBuy = [...quotes].sort(() => 0.5 - Math.random()).slice(0, 10).map(s => ({
      symbol: s.symbol.replace('.JK', ''),
      val: (Math.random() * 400 + 50) * 1e9
    }));

    const netForeignSell = [...quotes].sort(() => 0.5 - Math.random()).slice(0, 10).map(s => ({
      symbol: s.symbol.replace('.JK', ''),
      val: (Math.random() * 400 + 50) * 1e9
    }));

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      topGainers,
      topLosers,
      topVolume,
      topValue,
      topFreq,
      netForeignBuy,
      netForeignSell,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
