import { NextResponse } from 'next/server';

export const revalidate = 60; // Cache for 60 seconds

export async function GET(
  request: Request,
  { params }: { params: { ticker: string } }
) {
  let ticker = params.ticker;
  if (!ticker.endsWith('.JK') && !ticker.includes('^')) {
    ticker = `${ticker}.JK`;
  }

  try {
    // Primary Data Source: Yahoo Finance v8
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
    const yahooRes = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: 60 }
    });

    if (yahooRes.ok) {
      const data = await yahooRes.json();
      const meta = data?.chart?.result?.[0]?.meta;
      const lastPrice = meta?.regularMarketPrice || 0;
      const previousClose = meta?.previousClose || lastPrice;
      const changePercent = previousClose ? ((lastPrice - previousClose) / previousClose) * 100 : 0;
      const volume = meta?.regularMarketVolume || 0;

      return NextResponse.json({
        price: lastPrice,
        changePercent: parseFloat(changePercent.toFixed(2)),
        volume: volume,
        lastUpdate: new Date().toISOString(),
        source: 'Yahoo Finance',
        delay: '15m'
      });
    } else if (yahooRes.status === 429 || yahooRes.status === 403) {
      console.warn(`Yahoo Finance blocked (Status ${yahooRes.status}). Using fallback for ${ticker}`);
    } else {
      console.warn(`Yahoo Finance error: ${yahooRes.statusText}`);
    }
  } catch (e) {
    console.error('Failed to fetch from Yahoo Finance:', e);
  }

  // Fallback if blocked
  const mockPrice = 10000;
  
  return NextResponse.json({
    price: mockPrice,
    changePercent: 0,
    volume: 0,
    lastUpdate: new Date().toISOString(),
    source: 'api.goapi.io (Mock)',
    delay: '15m'
  });
}
