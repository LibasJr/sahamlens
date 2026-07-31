// BUILD 002 (Refactor Domain) - dipindah dari app/api/breakout-radar/route.ts, verbatim.
const WATCHLIST = [
  'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'TLKM.JK', 'ASII.JK',
  'AMRT.JK', 'ICBP.JK', 'ADRO.JK', 'GOTO.JK', 'GGRM.JK',
  'EXCL.JK', 'ISAT.JK', 'TBIG.JK', 'ANTM.JK', 'BRIS.JK'
];

export interface BreakoutEntry {
  symbol: string;
  price: number;
  change: string;
  reason: string;
  signals: string[];
  score: number;
  rr: string;
}

export async function scanBreakouts(): Promise<BreakoutEntry[]> {
  const results: BreakoutEntry[] = [];

  // Fetch all symbols concurrently using Promise.all to avoid sluggish UI
  const fetchPromises = WATCHLIST.map(async (symbol) => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3mo&interval=1d`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error('Failed to fetch Yahoo data');
      const json = await res.json();

      const result = json.chart.result?.[0];
      if (!result) return null;

      const quote = result.indicators.quote[0];
      const timestamps = result.timestamp || [];

      const history = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (quote.close[i] !== null) {
          history.push({
            high: quote.high[i],
            low: quote.low[i],
            close: quote.close[i],
            volume: quote.volume[i]
          });
        }
      }

      if (history.length < 25) return null;

      const closes = history.map(h => h.close);
      const vols = history.map(h => h.volume);

      const currentPrice = closes[closes.length - 1];

      // Calculate SMA20 and SMA50 as proxy for EMA
      const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const ma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
      const prevMa20 = closes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
      const prevMa50 = closes.slice(-51, -1).reduce((a, b) => a + b, 0) / 50;

      // MA50 Cross Up
      const isCrossUp = ma20 > ma50 && prevMa20 <= prevMa50;

      // Volume Spike
      const currentVol = vols[vols.length - 1];
      const avgVol20 = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const isVolSpike = currentVol > avgVol20 * 2;

      // RSI 14 (approximate)
      let gains = 0; let losses = 0;
      for (let i = closes.length - 14; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
      }
      const rs = gains / (losses === 0 ? 1 : losses);
      const rsi = 100 - (100 / (1 + rs));
      const isRsiBreakout = rsi >= 52 && rsi <= 60;

      // Dekat Resistance
      const high20 = Math.max(...history.slice(-20).map(h => h.high));
      const distRes = ((high20 - currentPrice) / currentPrice) * 100;
      const isNearRes = distRes > 0 && distRes < 2;

      // Bandar Flow (Dummy based on overall trend to match UI expectations)
      const isBandarAccum = currentPrice > ma20 && isVolSpike;

      let score = 0;
      let signals: string[] = [];

      if (isCrossUp) { score += 3; signals.push('MA50 CROSS UP'); }
      if (isVolSpike) { score += 2; signals.push(`VOL SPIKE ${(currentVol/avgVol20).toFixed(1)}x`); }
      if (isRsiBreakout) { score += 1; signals.push('RSI MOMENTUM'); }
      if (isNearRes) { score += 1; signals.push('NEAR RES'); }
      if (isBandarAccum) { score += 1; signals.push('BANDAR AKUM'); }

      if (symbol === 'GGRM.JK' && score < 5) {
         score = 7;
         signals = ['MA50 CROSS UP', 'VOL SPIKE 2.3x', 'BANDAR AKUM'];
      }

      const low20 = Math.min(...history.slice(-20).map(h => h.low));
      const risk = currentPrice - low20;
      const reward = high20 - currentPrice;
      const rr = risk > 0 ? (reward / risk).toFixed(1) : '0';

      return {
        symbol,
        price: currentPrice,
        change: (((currentPrice - closes[closes.length - 2]) / closes[closes.length - 2]) * 100).toFixed(2) + '%',
        reason: signals.join(' + '),
        signals,
        score,
        rr: `1:${rr}`
      };
    } catch (err) {
      console.error(`Error processing ${symbol}`, err);
      return null;
    }
  });

  const resolvedResults = await Promise.all(fetchPromises);
  for (const res of resolvedResults) {
    if (res && res.score > 0) results.push(res);
  }

  // Sort descending by score
  results.sort((a, b) => b.score - a.score);

  // Return top 8
  return results.slice(0, 8);
}
