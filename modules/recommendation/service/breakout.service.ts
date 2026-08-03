import { AI_PICK_UNIVERSE } from '../../market/constants/ai-pick-universe';
import { calculateRsi } from '../../technical';
import { estimateFullDayVolume, isIdxMarketHoursNow, todayDateKeyWIB } from '../../../shared/market/trading-session';

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
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          high: quote.high[i],
          low: quote.low[i],
          close: quote.close[i],
          volume: quote.volume[i]
        });
      }
    }

    // BUG FIX (audit integritas data 2026-08-03, temuan H-02): penjaga sebelumnya
    // `history.length < 25` mengizinkan saham dengan 25-50 bar histori lewat, padahal
    // ma50/prevMa50 di bawah membagi dengan 50 TETAP walau `closes.slice(-50)` cuma
    // mengembalikan sejumlah elemen yang ADA (mis. 30 bar -> ma50 dihitung
    // (30 x harga)/50 = 60% dari harga sesungguhnya). Karena ma50 jadi jauh lebih kecil
    // dari harga, `ma20 > ma50` selalu true dan bisa memicu GOLDEN CROSS PALSU (+3 poin
    // skor breakout) untuk saham yang histori panjangnya belum cukup. prevMa50 butuh
    // jendela 50 bar berakhir SATU hari sebelum hari ini, jadi minimal 51 bar total.
    if (history.length < 51) return null;

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
    // BUG FIX (audit integritas data 2026-08-03, temuan M-02): volume hari ini selama
    // jam bursa masih PARSIAL - dibandingkan mentah dengan rata-rata 20 hari PENUH,
    // "VOL SPIKE" (>2x avg, bobot terbesar skor breakout) bias tidak pernah terpicu di
    // pagi/siang hari walau volumenya sedang menuju spike sungguhan.
    const lastBar = history[history.length - 1];
    const isLiveFormingBar = lastBar.date === todayDateKeyWIB() && isIdxMarketHoursNow();
    const currentVol = isLiveFormingBar ? estimateFullDayVolume(vols[vols.length - 1]) : vols[vols.length - 1];
    const avgVol20 = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const isVolSpike = currentVol > avgVol20 * 2;

    // RSI 14 - Wilder smoothing baku (lihat modules/technical/service/rsi.ts), bukan
    // rata-rata aritmatik sederhana yang dulu di sini (bias, lihat H-01 di audit).
    const rsi = calculateRsi(closes, 14) ?? 50;
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
