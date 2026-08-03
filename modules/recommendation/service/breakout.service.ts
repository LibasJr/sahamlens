import { AI_PICK_UNIVERSE } from '../../market/constants/ai-pick-universe';

// BUILD 002 (Refactor Domain) - dipindah dari app/api/breakout-radar/route.ts, verbatim.
// 2026-08-03: dulu 15 ticker hardcoded di sini, sementara kategori AI Pick lain memindai
// 250 saham - akibatnya "Breakout (7)" dan "Menarik (50)" tidak sebanding, dan hanya 15
// saham itu yang pernah bisa mendapat bonus breakout di peringkat. Sekarang memakai
// universe bersama, lihat modules/market/constants/ai-pick-universe.ts.
const WATCHLIST = AI_PICK_UNIVERSE;

export interface BreakoutEntry {
  symbol: string;
  price: number;
  change: string;
  reason: string;
  signals: string[];
  score: number;
  rr: string;
}

export interface CrossEntry {
  symbol: string;
  price: number;
  change: string;
}

interface RawSymbolSignal {
  symbol: string;
  currentPrice: number;
  changeStr: string;
  isCrossUp: boolean;
  isDeadCross: boolean;
  score: number;
  signals: string[];
  rr: string;
}

async function analyzeSymbolForBreakout(symbol: string): Promise<RawSymbolSignal | null> {
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

    // Golden Cross (MA20 baru saja memotong ke atas MA50 - sinyal bullish klasik) dan
    // Dead Cross (kebalikannya, MA20 memotong ke bawah MA50 - sinyal bearish klasik).
    const isCrossUp = ma20 > ma50 && prevMa20 <= prevMa50;
    const isDeadCross = ma20 < ma50 && prevMa20 >= prevMa50;

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

    // Bandar Flow (proxy dari volume+harga di atas MA20, BUKAN data broker sungguhan)
    const isBandarAccum = currentPrice > ma20 && isVolSpike;

    let score = 0;
    const signals: string[] = [];

    if (isCrossUp) { score += 3; signals.push('GOLDEN CROSS'); }
    if (isVolSpike) { score += 2; signals.push(`VOL SPIKE ${(currentVol/avgVol20).toFixed(1)}x`); }
    if (isRsiBreakout) { score += 1; signals.push('RSI MOMENTUM'); }
    if (isNearRes) { score += 1; signals.push('NEAR RES'); }
    if (isBandarAccum) { score += 1; signals.push('BANDAR AKUM'); }

    const low20 = Math.min(...history.slice(-20).map(h => h.low));
    const risk = currentPrice - low20;
    const reward = high20 - currentPrice;
    const rr = risk > 0 ? (reward / risk).toFixed(1) : '0';

    return {
      symbol,
      currentPrice,
      changeStr: (((currentPrice - closes[closes.length - 2]) / closes[closes.length - 2]) * 100).toFixed(2) + '%',
      isCrossUp,
      isDeadCross,
      score,
      signals,
      rr: `1:${rr}`,
    };
  } catch (err) {
    console.error(`Error processing ${symbol}`, err);
    return null;
  }
}

export async function scanBreakouts(): Promise<BreakoutEntry[]> {
  const resolvedResults = await Promise.all(WATCHLIST.map(analyzeSymbolForBreakout));

  const results: BreakoutEntry[] = [];
  for (const r of resolvedResults) {
    if (r && r.score > 0) {
      results.push({
        symbol: r.symbol,
        price: r.currentPrice,
        change: r.changeStr,
        reason: r.signals.join(' + '),
        signals: r.signals,
        score: r.score,
        rr: r.rr,
      });
    }
  }

  // Sort descending by score
  results.sort((a, b) => b.score - a.score);

  // Return top 8
  return results.slice(0, 8);
}

// Golden Cross & Dead Cross - dipisah dari skor breakout (yang murni bullish) supaya
// sinyal bearish (Dead Cross) juga bisa ditampilkan di halaman AI Pick, bukan cuma
// dibuang karena tidak menyumbang skor breakout positif.
export async function scanCrossSignals(): Promise<{ golden: CrossEntry[]; dead: CrossEntry[] }> {
  const resolvedResults = await Promise.all(WATCHLIST.map(analyzeSymbolForBreakout));

  const golden: CrossEntry[] = [];
  const dead: CrossEntry[] = [];
  for (const r of resolvedResults) {
    if (!r) continue;
    const entry = { symbol: r.symbol, price: r.currentPrice, change: r.changeStr };
    if (r.isCrossUp) golden.push(entry);
    else if (r.isDeadCross) dead.push(entry);
  }

  return { golden, dead };
}
