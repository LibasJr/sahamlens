// BUILD 009 (Performance) - fetch+parse OHLC Yahoo Finance chart yang SAMA PERSIS
// sebelumnya diduplikasi di app/api/council/route.ts (getTechnicalData) dan
// modules/ai/service/orchestrator.service.ts (fetchHistory) - disatukan di sini,
// dipakai ulang oleh keduanya. app/api/stock/[ticker]/route.ts SENGAJA TIDAK
// diikutsertakan/disentuh - punya kebutuhan lebih kompleks (range dinamis, cache
// stale-fallback, Promise.race dengan quoteSummary) dan sudah stabil di production
// sebagai jalur trafik/revenue tertinggi aplikasi ini - risiko refactor lebih besar
// dari manfaat dedup di titik itu.

export interface OhlcRow {
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
}

export interface YahooHistoryResult {
  history: OhlcRow[];
  currentPrice: number;
}

export async function fetchYahooHistory(ticker: string, range: string = '1y'): Promise<YahooHistoryResult | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=1d`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const data = await res.json();
    const result = data.chart.result?.[0];
    if (!result) return null;

    const currentPrice = result.meta.regularMarketPrice;
    const timestamps = result.timestamp || [];
    const quote = result.indicators.quote[0];

    const history: OhlcRow[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close[i] !== null) {
        history.push({
          Date: new Date(timestamps[i] * 1000).toISOString(),
          Open: quote.open[i],
          High: quote.high[i],
          Low: quote.low[i],
          Close: quote.close[i],
          Volume: quote.volume[i],
        });
      }
    }
    if (history.length === 0) return null;
    return { history, currentPrice };
  } catch (e) {
    clearTimeout(timeoutId);
    return null;
  }
}
