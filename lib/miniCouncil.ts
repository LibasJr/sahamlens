// Council AI Mini-Engine - 10 agen rule-based yang jalan 100% di client dari data
// OHLCV asli (tanpa login, tanpa panggilan model bahasa). Dipakai bareng oleh halaman
// depan publik (components/Dashboard.tsx) dan halaman /technical/[symbol] supaya
// insight yang ditampilkan konsisten dan selalu berbasis angka nyata, bukan template
// statis. Council AI Pro (10 agen Gemini penuh di /api/council) tetap ada terpisah
// untuk analisis mendalam yang butuh akun Pro.

import { calculateRsi } from '@/modules/technical/service/rsi';
import { analyzeBandarmology } from '@/modules/market/service/foreign-flow-proxy';

export type Candle = { time: string; open: number; high: number; low: number; close: number; volume: number };
export type Signal = 'BUY' | 'HOLD' | 'SELL';
export type MiniAgent = { name: string; signal: Signal; reason: string };

export type Indicators = {
  time: string; price: number; prevClose: number; change: number; changePct: number;
  ma20: number | null; ma50: number | null; ma200: number | null; rsi14: number | null; rsiLabel: string;
  volume: number; value: number; volRatio: number; score: number;
  signal: Signal; crossLabel: string;
};

/** Label arus dana untuk header chart - Chaikin Money Flow 20 hari dari OHLCV nyata
 * (definisi SAMA dengan Screener/BandarFlowPro, lihat modules/market/service/
 * foreign-flow-proxy.ts). `null` kalau candle < 20 (CMF 20 hari tidak bisa dihitung
 * jujur dari data yang lebih pendek).
 *
 * BUG FIX (audit logika & algoritma 2026-08-05, temuan C-2): pemanggil SEBELUMNYA
 * menurunkan label "AKUMULASI/DISTRIBUSI" dari `volRatio > 1` semata - volume di atas
 * rata-rata BUKAN akumulasi (saham yang anjlok dengan volume 3x ikut dilabeli
 * "AKUMULASI"), dan arah harga tidak ikut dihitung sama sekali. CMF memakai posisi
 * close di dalam range High-Low dibobot volume, jadi arah benar-benar terwakili. */
export function moneyFlowLabel(candles: Candle[]): string | null {
  if (!candles || candles.length < 20) return null;
  const history = candles.slice(-20).map((c) => ({
    date: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume || 0,
  }));
  const bandarmology = analyzeBandarmology(history);
  const cmf = bandarmology.cmf20;
  const sign = cmf > 0 ? '+' : '';
  if (bandarmology.status === 'BULLISH') return `AKUMULASI (${sign}${cmf}%)`;
  if (bandarmology.status === 'BEARISH') return `DISTRIBUSI (${sign}${cmf}%)`;
  return `NETRAL (${sign}${cmf}%)`;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// BUG FIX (audit integritas data 2026-08-03, temuan H-01): sebelumnya rata-rata
// aritmatik sederhana (bias, lihat modules/technical/service/rsi.ts untuk bukti
// empiris) - diganti calculateRsi() bersama (Wilder smoothing), satu hasil RSI di
// seluruh aplikasi untuk saham yang sama.
function calcRsi(closes: number[], period = 14): number | null {
  return calculateRsi(closes, period);
}

// Indikator inti (dipakai untuk badge harga/MA/RSI/volume) - real, dari OHLCV asli.
export function computeIndicators(time: string, closes: number[], volumes: number[]): Indicators {
  const price = closes[closes.length - 1];
  const prev = closes.length > 1 ? closes[closes.length - 2] : price;
  const change = price - prev;
  const changePct = prev ? (change / prev) * 100 : 0;
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  // MA200 hanya kalau benar-benar ada 200 bar - `sma()` mengembalikan null di bawah itu,
  // BUKAN rata-rata bar seadanya yang dilabeli "MA200" (temuan H-2).
  const ma200 = sma(closes, 200);
  const rsi14 = calcRsi(closes, 14);
  const volume = volumes[volumes.length - 1] || 0;
  const avgVolume20 = volumes.length >= 20
    ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
    : (volumes.reduce((a, b) => a + b, 0) / (volumes.length || 1));
  const volRatio = avgVolume20 ? volume / avgVolume20 : 1;
  const value = volume * price;

  let conditionsMet = 0;
  if (ma20 != null && price > ma20) conditionsMet++;
  if (ma20 != null && ma50 != null && ma20 > ma50) conditionsMet++;
  if (volRatio > 1) conditionsMet++;
  const score = Math.round((conditionsMet / 3) * 100);

  let signal: Signal = 'HOLD';
  if (ma20 != null && ma50 != null) {
    if (price > ma20 && ma20 > ma50) signal = 'BUY';
    else if (price < ma20 && ma20 < ma50) signal = 'SELL';
  }
  const crossLabel = (ma20 != null && ma50 != null)
    ? (ma20 > ma50 ? 'Golden Cross (MA20 di atas MA50)' : 'Death Cross (MA20 di bawah MA50)')
    : 'Data historis belum cukup';

  let rsiLabel = 'Netral';
  if (rsi14 != null) {
    if (rsi14 >= 70) rsiLabel = 'Overbought';
    else if (rsi14 <= 30) rsiLabel = 'Oversold';
    else if (rsi14 > 50) rsiLabel = 'Netral Cenderung Beli';
    else rsiLabel = 'Netral Cenderung Jual';
  }

  return { time, price, prevClose: prev, change, changePct, ma20, ma50, ma200, rsi14, rsiLabel, volume, value, volRatio, score, signal, crossLabel };
}

export type CouncilResult = {
  agents: MiniAgent[];
  buyPct: number; sellPct: number; holdPct: number;
  finalSignal: Signal; confidence: number;
  summary: string;
};

// 10 agen Council AI, masing-masing satu lensa teknikal independen - semua dihitung
// dari array OHLCV yang sama, tidak ada satupun yang mengarang kesimpulan.
export function computeMiniCouncil(candles: Candle[], isIndex: boolean = false): CouncilResult | null {
  if (candles.length < 5) return null;
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume || 0);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const last = candles[candles.length - 1];
  const prevCandle = candles.length > 1 ? candles[candles.length - 2] : last;

  const agents: MiniAgent[] = [];

  // 1. Trend Agent (MA20 vs MA50)
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  if (ma20 != null && ma50 != null) {
    const price = closes[closes.length - 1];
    if (price > ma20 && ma20 > ma50) agents.push({ name: 'Trend', signal: 'BUY', reason: 'Harga di atas MA20 dan MA20 di atas MA50 (uptrend jangka pendek-menengah terkonfirmasi).' });
    else if (price < ma20 && ma20 < ma50) agents.push({ name: 'Trend', signal: 'SELL', reason: 'Harga di bawah MA20 dan MA20 di bawah MA50 (downtrend terkonfirmasi).' });
    else agents.push({ name: 'Trend', signal: 'HOLD', reason: 'MA20/MA50 belum searah, tren jangka pendek masih campuran.' });
  } else {
    agents.push({ name: 'Trend', signal: 'HOLD', reason: 'Data historis belum cukup untuk MA50.' });
  }

  // 2. Momentum Agent (RSI14)
  const rsi = calcRsi(closes, 14);
  if (rsi != null) {
    if (rsi <= 30) agents.push({ name: 'Momentum', signal: 'BUY', reason: `RSI ${rsi.toFixed(1)} oversold, tekanan jual mulai jenuh.` });
    else if (rsi >= 70) agents.push({ name: 'Momentum', signal: 'SELL', reason: `RSI ${rsi.toFixed(1)} overbought, potensi koreksi jangka pendek.` });
    else agents.push({ name: 'Momentum', signal: 'HOLD', reason: `RSI ${rsi.toFixed(1)} netral, belum ada tekanan ekstrem.` });
  } else {
    agents.push({ name: 'Momentum', signal: 'HOLD', reason: 'Data harian belum cukup untuk RSI14.' });
  }

  // 3. Volume Agent
  const avgVol20 = volumes.length >= 20 ? sma(volumes, 20) : (volumes.reduce((a, b) => a + b, 0) / volumes.length);
  const volRatio = avgVol20 ? volumes[volumes.length - 1] / avgVol20 : 1;
  if (volRatio > 1.3) agents.push({ name: 'Volume', signal: closes[closes.length - 1] >= prevCandle.close ? 'BUY' : 'SELL', reason: `Volume ${((volRatio - 1) * 100).toFixed(0)}% di atas rata-rata 20 hari, minat pasar meningkat tajam.` });
  else if (volRatio < 0.7) agents.push({ name: 'Volume', signal: 'HOLD', reason: `Volume ${((1 - volRatio) * 100).toFixed(0)}% di bawah rata-rata, minat pasar sepi.` });
  else agents.push({ name: 'Volume', signal: 'HOLD', reason: 'Volume berada di kisaran rata-rata 20 hari.' });

  // 4. MACD Agent
  if (closes.length >= 35) {
    const emaFast = ema(closes, 12);
    const emaSlow = ema(closes, 26);
    const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
    const signalLine = ema(macdLine, 9);
    const macdNow = macdLine[macdLine.length - 1];
    const sigNow = signalLine[signalLine.length - 1];
    const macdPrev = macdLine[macdLine.length - 2];
    const sigPrev = signalLine[signalLine.length - 2];
    if (macdPrev <= sigPrev && macdNow > sigNow) agents.push({ name: 'MACD', signal: 'BUY', reason: 'MACD baru saja golden cross terhadap signal line.' });
    else if (macdPrev >= sigPrev && macdNow < sigNow) agents.push({ name: 'MACD', signal: 'SELL', reason: 'MACD baru saja death cross terhadap signal line.' });
    else agents.push({ name: 'MACD', signal: macdNow > sigNow ? 'BUY' : 'SELL', reason: macdNow > sigNow ? 'MACD masih di atas signal line, momentum beli bertahan.' : 'MACD masih di bawah signal line, momentum jual bertahan.' });
  } else {
    agents.push({ name: 'MACD', signal: 'HOLD', reason: 'Data belum cukup (butuh min. 35 hari) untuk MACD.' });
  }

  // 5. Volatility / Bollinger Agent
  if (ma20 != null && closes.length >= 20) {
    const sd = stddev(closes.slice(-20));
    const upper = ma20 + 2 * sd;
    const lower = ma20 - 2 * sd;
    const price = closes[closes.length - 1];
    const width = ma20 ? (upper - lower) / ma20 : 0;
    if (price >= upper) agents.push({ name: 'Volatilitas', signal: 'SELL', reason: 'Harga menyentuh upper Bollinger Band, rawan pullback jangka pendek.' });
    else if (price <= lower) agents.push({ name: 'Volatilitas', signal: 'BUY', reason: 'Harga menyentuh lower Bollinger Band, area jenuh jual.' });
    else agents.push({ name: 'Volatilitas', signal: 'HOLD', reason: `Harga bergerak dalam band (lebar ${(width * 100).toFixed(1)}% dari MA20), belum ekstrem.` });
  } else {
    agents.push({ name: 'Volatilitas', signal: 'HOLD', reason: 'Data belum cukup untuk Bollinger Band 20 hari.' });
  }

  // 6. Support/Resistance Agent
  const lookback = Math.min(50, candles.length);
  const recentHigh = Math.max(...highs.slice(-lookback));
  const recentLow = Math.min(...lows.slice(-lookback));
  const price = closes[closes.length - 1];
  const rangeSpan = recentHigh - recentLow || 1;
  const posInRange = (price - recentLow) / rangeSpan;
  if (posInRange <= 0.15) agents.push({ name: 'Support/Resistance', signal: 'BUY', reason: `Harga dekat support ${lookback}-hari (Rp ${Math.round(recentLow).toLocaleString('id-ID')}).` });
  else if (posInRange >= 0.85) agents.push({ name: 'Support/Resistance', signal: 'SELL', reason: `Harga dekat resistance ${lookback}-hari (Rp ${Math.round(recentHigh).toLocaleString('id-ID')}).` });
  else agents.push({ name: 'Support/Resistance', signal: 'HOLD', reason: `Harga di tengah range ${lookback}-hari (support Rp ${Math.round(recentLow).toLocaleString('id-ID')} - resistance Rp ${Math.round(recentHigh).toLocaleString('id-ID')}).` });

  // 7. Money Flow (OBV slope) Agent
  const obv: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const dir = closes[i] > closes[i - 1] ? 1 : closes[i] < closes[i - 1] ? -1 : 0;
    obv.push(obv[i - 1] + dir * (volumes[i] || 0));
  }
  const obvLookback = Math.min(10, obv.length - 1);
  const obvSlope = obvLookback > 0 ? obv[obv.length - 1] - obv[obv.length - 1 - obvLookback] : 0;
  if (obvSlope > 0) agents.push({ name: 'Money Flow', signal: 'BUY', reason: 'On-Balance Volume naik 10 hari terakhir, indikasi akumulasi.' });
  else if (obvSlope < 0) agents.push({ name: 'Money Flow', signal: 'SELL', reason: 'On-Balance Volume turun 10 hari terakhir, indikasi distribusi.' });
  else agents.push({ name: 'Money Flow', signal: 'HOLD', reason: 'On-Balance Volume relatif flat.' });

  // 8. Candlestick Pattern Agent (candle terakhir)
  const body = Math.abs(last.close - last.open);
  const range = (last.high - last.low) || 1;
  const isBullish = last.close > last.open;
  const prevIsBearish = prevCandle.close < prevCandle.open;
  const isEngulfing = isBullish && prevIsBearish && last.close > prevCandle.open && last.open < prevCandle.close;
  if (isEngulfing) agents.push({ name: 'Candlestick', signal: 'BUY', reason: 'Pola bullish engulfing terbentuk pada candle terakhir.' });
  else if (body / range < 0.25) agents.push({ name: 'Candlestick', signal: 'HOLD', reason: 'Candle terakhir berbadan kecil (doji-like), pasar ragu arah.' });
  else agents.push({ name: 'Candlestick', signal: isBullish ? 'BUY' : 'SELL', reason: isBullish ? 'Candle terakhir bullish dengan badan solid.' : 'Candle terakhir bearish dengan badan solid.' });

  // 9. Price Action (struktur higher-high/lower-low 10 candle terakhir)
  const paLookback = Math.min(10, candles.length);
  const recentCloses = closes.slice(-paLookback);
  const higherHighs = recentCloses[recentCloses.length - 1] > Math.max(...recentCloses.slice(0, -1));
  const lowerLows = recentCloses[recentCloses.length - 1] < Math.min(...recentCloses.slice(0, -1));
  if (higherHighs) agents.push({ name: 'Price Action', signal: 'BUY', reason: `Harga mencetak level tertinggi baru dalam ${paLookback} hari terakhir.` });
  else if (lowerLows) agents.push({ name: 'Price Action', signal: 'SELL', reason: `Harga mencetak level terendah baru dalam ${paLookback} hari terakhir.` });
  else agents.push({ name: 'Price Action', signal: 'HOLD', reason: `Harga masih dalam range ${paLookback} hari terakhir, belum breakout.` });

  // 10. Risk Agent (drawdown dari high 52-candle)
  const riskLookback = Math.min(52, candles.length);
  const high52 = Math.max(...highs.slice(-riskLookback));
  const drawdown = high52 ? ((high52 - price) / high52) * 100 : 0;
  if (drawdown > 20) agents.push({ name: 'Risk Manager', signal: 'SELL', reason: `Harga sudah turun ${drawdown.toFixed(0)}% dari puncak ${riskLookback} candle, waspada risiko lanjutan.` });
  else if (drawdown < 5) agents.push({ name: 'Risk Manager', signal: 'BUY', reason: 'Harga dekat level tertinggi historis terkini, momentum risiko terkendali.' });
  else agents.push({ name: 'Risk Manager', signal: 'HOLD', reason: `Harga ${drawdown.toFixed(0)}% di bawah puncak ${riskLookback} candle, risiko moderat.` });

  const buyCount = agents.filter(a => a.signal === 'BUY').length;
  const sellCount = agents.filter(a => a.signal === 'SELL').length;
  const holdCount = agents.filter(a => a.signal === 'HOLD').length;
  const total = agents.length;
  const buyPct = Math.round((buyCount / total) * 100);
  const sellPct = Math.round((sellCount / total) * 100);
  const holdPct = Math.round((holdCount / total) * 100);

  let finalSignal: Signal = 'HOLD';
  let confidence = holdPct;
  if (buyCount > sellCount && buyCount > holdCount) { finalSignal = 'BUY'; confidence = buyPct; }
  else if (sellCount > buyCount && sellCount > holdCount) { finalSignal = 'SELL'; confidence = sellPct; }

  // Ringkasan ditulis sebagai kesimpulan langsung yang substantif - bukan rincian
  // "sekian suara BUY/HOLD/SELL" atau menyebut jumlah agen. Metodenya tetap gabungan
  // beberapa lensa teknikal independen (kode di atas), tapi yang ditampilkan ke user
  // cukup kesimpulannya + alasan konkret yang mendukung, seperti seorang analis
  // menjelaskan pendapatnya - bukan hasil pemungutan suara.
  const supporting = agents.filter(a => a.signal === finalSignal).slice(0, 2).map(a => a.reason);
  const opposing = agents.find(a => a.signal !== finalSignal && a.signal !== 'HOLD');
  // BUG FIX (permintaan eksplisit): index (mis. IHSG) BUKAN saham - tidak ada "beli/jual
  // 1 lot indeks", jadi wording verdict untuk index dibuat beda dari saham individual
  // (arah momentum, bukan ajakan transaksi).
  const subject = isIndex ? 'IHSG' : 'saham ini';
  const verdictText = finalSignal === 'BUY'
    ? (isIndex ? 'menunjukkan momentum menguat' : 'layak dipertimbangkan untuk dibeli')
    : finalSignal === 'SELL'
    ? (isIndex ? 'menunjukkan tekanan pelemahan' : 'sebaiknya diwaspadai / dipertimbangkan untuk dijual')
    : (isIndex ? 'masih bergerak sideways (wait-and-see)' : 'masih dalam fase wait-and-see (tahan dulu)');
  let summary = `LensAI menilai ${subject} ${verdictText}.`;
  if (supporting.length) summary += ` ${supporting.join(' ')}`;
  if (opposing) summary += ` Yang perlu diwaspadai: ${opposing.reason}`;

  return { agents, buyPct, sellPct, holdPct, finalSignal, confidence, summary };
}

// Insight naratif ringkas (dipakai untuk kartu "Insight Terkini") - juga rule-based,
// murni turunan dari Indicators yang sama, tidak ada teks kalengan yang mengarang data.
export function generateInsight(ind: Indicators): string {
  const notes: string[] = [];
  const { price, ma20, ma50, rsi14, volRatio } = ind;

  if (ma20 != null && ma50 != null) {
    if (price < ma20 && ma20 < ma50) {
      notes.push('Downtrend terkonfirmasi, harga berada di bawah MA20 dan MA50. Tekanan jual masih dominan.');
    } else if (price > ma20 && ma20 > ma50) {
      notes.push('Uptrend terkonfirmasi, harga berada di atas MA20 dan MA50. Tekanan beli masih dominan.');
    } else {
      notes.push('Harga sedang sideways di sekitar MA20/MA50, belum ada tren jangka pendek yang jelas.');
    }
  }

  if (rsi14 != null) {
    if (rsi14 < 30) notes.push(`RSI ${rsi14.toFixed(1)} menunjukkan kondisi oversold (di bawah 30), potensi technical rebound.`);
    else if (rsi14 > 70) notes.push(`RSI ${rsi14.toFixed(1)} menunjukkan kondisi overbought (di atas 70), potensi technical pullback.`);
  }

  if (volRatio > 1.2) notes.push(`Volume ${((volRatio - 1) * 100).toFixed(0)}% di atas rata-rata 20 hari, minat pasar meningkat.`);
  else if (volRatio < 0.8) notes.push(`Volume ${((1 - volRatio) * 100).toFixed(0)}% di bawah rata-rata 20 hari, minat pasar cenderung sepi.`);

  if (notes.length === 0) return 'Belum cukup data historis untuk menghasilkan insight teknikal pada titik ini.';
  return notes.join(' ');
}
