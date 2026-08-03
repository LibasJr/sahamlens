import { NextResponse } from 'next/server';

export const revalidate = 60;

export async function GET(
  request: Request,
  { params }: { params: { ticker: string } }
) {
  const { searchParams } = new URL(request.url);
  // Default '1Y' (bukan lagi '1M') - permintaan eksplisit supaya semua chart (Beranda,
  // Teknikal, Dashboard) default menampilkan histori 1 tahun.
  const tf = searchParams.get('tf') || '1Y';

  let range = '6mo';
  let interval = '1d';
  let sliceLastNDays: number | null = null;
  if (tf === '1D') { range = '1d'; interval = '5m'; }
  else if (tf === '3D') { range = '5d'; interval = '15m'; sliceLastNDays = 3; }
  else if (tf === '7D') { range = '5d'; interval = '15m'; }
  else if (tf === '1M') { range = '1mo'; interval = '1d'; }
  else if (tf === '3M') { range = '3mo'; interval = '1d'; }
  // 1Y, 10Y & ALL sengaja TETAP candle harian (bukan mingguan/bulanan) - permintaan
  // eksplisit supaya pergerakan harian tetap terlihat penuh di rentang panjang, bukan
  // diringkas.
  else if (tf === '1Y') { range = '1y'; interval = '1d'; }
  else if (tf === '10Y') { range = '10y'; interval = '1d'; }
  else if (tf === 'ALL') { range = '20y'; interval = '1d'; }

  let ticker = params.ticker;
  if (!ticker.endsWith('.JK') && !ticker.includes('^')) {
    ticker = `${ticker}.JK`;
  }

  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=${interval}`;
    const res = await fetch(yahooUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 60 }
    });

    if (!res.ok) throw new Error('Failed to fetch from Yahoo');

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('No data');

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const isIntraday = interval.endsWith('m') || interval.endsWith('h');

    let history = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close[i] !== null) {
        const iso = new Date(timestamps[i] * 1000).toISOString();
        history.push({
          time: isIntraday ? iso : iso.split('T')[0],
          open: quote.open[i] || quote.close[i],
          high: quote.high[i] || quote.close[i],
          low: quote.low[i] || quote.close[i],
          close: quote.close[i],
          price: quote.close[i],
          volume: quote.volume[i] || 0
        });
      }
    }

    if (sliceLastNDays != null) {
      const uniqueDays = Array.from(new Set(history.map((h) => h.time.slice(0, 10))));
      const keepDays = new Set(uniqueDays.slice(-sliceLastNDays));
      history = history.filter((h) => keepDays.has(h.time.slice(0, 10)));
    }

    return NextResponse.json({
      ticker,
      history
    });
  } catch (e: any) {
    console.error('Public chart API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
