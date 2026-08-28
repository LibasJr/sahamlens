import { calculateRsi } from '@/modules/technical/service/rsi';
import { resolvePreviousClose } from '@/shared/market/previous-close';
import type { StockAnalysisResponse, StockAnalyzerResult } from '@/modules/technical/contracts';

export type DashboardCandle = {
  close: number;
  volume?: number | null;
  time?: string | number;
  Date?: string;
  date?: string;
  [key: string]: unknown;
};

type DashboardFreshnessMeta = {
  dataTimestamp?: string | null;
  freshness?: string | null;
  source?: string | null;
  ageSeconds?: number | null;
  staleReason?: string | null;
};

export type DashboardIndexPayload = {
  stock: {
    symbol: string;
    name: string;
    current_price: number | null;
    change_pct: number | null;
    history: DashboardCandle[];
  };
  analyzers: StockAnalyzerResult[];
  technical: Record<string, never>;
  price: number | null;
  scoring: null;
  decision: null;
  tradeSetup: null;
  tradePlan: null;
  consensus: null;
  eligibility: null;
  _meta: DashboardFreshnessMeta;
};

export const isIndexTicker = (symbol: string) => {
  const value = symbol.trim().toUpperCase().replace(/\.JK$/, '');
  return value === 'IHSG' || value === 'JKSE' || value === '^JKSE';
};

export const normalizeDashboardTicker = (symbol: string) => (
  isIndexTicker(symbol)
    ? '^JKSE'
    : `${symbol.replace('.JK', '').replace('.JK', '')}.JK`
);

export const displayDashboardTicker = (symbol: string) => (
  isIndexTicker(symbol) ? 'IHSG' : symbol.replace('.JK', '').replace('.JK', '')
);

export type DashboardData = StockAnalysisResponse | DashboardIndexPayload;

export function buildIndexPayload(symbol: string, candles: DashboardCandle[]): DashboardIndexPayload {
  const last = candles[candles.length - 1];
  const close = typeof last?.close === 'number' ? last.close : null;
  const timestamps = candles.map((candle) => {
    const rawTime = candle?.time ?? candle?.Date ?? candle?.date;
    const millis = typeof rawTime === 'number' ? rawTime * 1000 : (typeof rawTime === 'string' ? Date.parse(rawTime) : NaN);
    return Number.isFinite(millis) ? Math.floor(millis / 1000) : null;
  });
  const closes = candles.map((candle) => candle?.close);
  const { previousClose } = resolvePreviousClose({ timestamps, closes });
  const changePct = close != null && previousClose != null && previousClose > 0
    ? Number((((close - previousClose) / previousClose) * 100).toFixed(2))
    : null;

  return {
    stock: {
      symbol,
      name: 'Indeks Harga Saham Gabungan (IHSG)',
      current_price: close,
      change_pct: changePct,
      history: candles,
    },
    analyzers: [],
    technical: {},
    price: close,
    scoring: null,
    decision: null,
    tradeSetup: null,
    tradePlan: null,
    consensus: null,
    eligibility: null,
    _meta: {
      dataTimestamp: typeof last?.Date === 'string'
        ? last.Date
        : (typeof last?.date === 'string' ? last.date : null),
      freshness: 'EOD',
    },
  };
}

export const splitStatusText = (value?: string | null) => {
  const text = (value || '').trim();
  if (!text) return { primary: 'AWAITING', detail: '' };
  const match = text.match(/^([^()]+?)\s*(?:\((.+)\))?$/);
  return {
    primary: (match?.[1] || text).trim(),
    detail: (match?.[2] || '').trim(),
  };
};

export function smaOf(candles: { close: number }[], period: number): number | undefined {
  if (!candles || candles.length < period) return undefined;
  const slice = candles.slice(-period);
  return Math.round(slice.reduce((sum, candle) => sum + candle.close, 0) / period);
}

export function pctChange(candles: { close: number }[], days: number): number | null {
  if (!candles || candles.length <= days) return null;
  const last = candles[candles.length - 1]?.close;
  const base = candles[candles.length - 1 - days]?.close;
  if (typeof last !== 'number' || typeof base !== 'number' || base <= 0) return null;
  return Number((((last - base) / base) * 100).toFixed(2));
}

export function volatility20D(candles: { close: number }[]): number | null {
  if (!candles || candles.length < 22) return null;
  const returns = candles.slice(-21).slice(1).map((candle, index) => {
    const previous = candles[candles.length - 21 + index]?.close;
    return previous > 0 ? (candle.close - previous) / previous : 0;
  });
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / returns.length;
  return Number((Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(1));
}

export function formatPct(value: number | null) {
  if (value == null) return 'N/A';
  return `${value > 0 ? '+' : ''}${value}%`;
}

export function toneClass(value: number | null) {
  if (value == null) return 'text-tv-muted';
  if (value > 0) return 'text-tv-green';
  if (value < 0) return 'text-tv-red';
  return 'text-tv-muted';
}

export const getMAStatus = (price: number, ma50: number, ma200: number) => {
  if (!price || !ma50 || !ma200) return { label: 'N/A', color: 'text-tv-muted', bg: 'bg-tv-hover' };
  if (price > ma50 && ma50 > ma200) return { label: 'GOLDEN TREND - Uptrend Kuat', color: 'text-tv-green', bg: 'bg-tv-green/15 border-tv-green/30' };
  if (price > ma50 && price < ma200) return { label: 'REBOUND LEMAH - Di bawah MA200', color: 'text-tv-yellow', bg: 'bg-tv-yellow/15 border-tv-yellow/30' };
  if (price > ma200 && price < ma50) return { label: 'KOREKSI - Di bawah MA50', color: 'text-tv-yellow', bg: 'bg-tv-yellow/15 border-tv-yellow/30' };
  if (price < ma50 && price < ma200) return { label: 'DOWNTREND - Di bawah MA50 & MA200', color: 'text-tv-red', bg: 'bg-tv-red/15 border-tv-red/30' };
  return { label: 'SIDEWAYS', color: 'text-tv-muted', bg: 'bg-tv-hover' };
};

export const signalBadgeTone = (signal: string | null | undefined) =>
  signal === 'STRONG BUY' ? 'bg-tv-green/20 text-tv-green border-tv-green/50' :
  signal === 'BUY' ? 'bg-tv-blue/20 text-tv-blue border-tv-blue/50' :
  signal === 'HOLD' || signal === 'DATA TIDAK CUKUP' ? 'bg-tv-yellow/20 text-tv-yellow border-tv-yellow/50' :
  signal === 'SELL' ? 'bg-tv-red/20 text-tv-red border-tv-red/50' :
  'bg-tv-hover text-tv-muted border-tv-border';

export function buildChartTechnical(analyzers: StockAnalyzerResult[], candles: DashboardCandle[]) {
  const emaAnalyzer = analyzers.find((analyzer) => analyzer.label?.includes('EMA'));
  const cmfAnalyzer = analyzers.find((analyzer) => analyzer.label?.includes('Bandarmology'));
  const cmfRaw = cmfAnalyzer?.raw;
  return {
    cross_status:
      typeof emaAnalyzer?.raw?.ema20 === 'number' && typeof emaAnalyzer?.raw?.ema50 === 'number'
        ? (emaAnalyzer.raw.ema20 > emaAnalyzer.raw.ema50 ? 'BULLISH' : 'BEARISH')
        : null,
    money_flow_status:
      typeof cmfRaw?.cmf20 === 'number'
        ? `${cmfRaw.status === 'BULLISH' ? 'AKUMULASI' : cmfRaw.status === 'BEARISH' ? 'DISTRIBUSI' : 'NETRAL'} (${cmfRaw.cmf20 > 0 ? '+' : ''}${cmfRaw.cmf20}%)`
        : null,
    ma50: smaOf(candles, 50),
    ma200: smaOf(candles, 200),
  };
}

export function buildIndexTechnicalSummary(candles: DashboardCandle[]) {
  if (candles.length < 2) return null;
  const closes = candles
    .map((candle) => candle.close)
    .filter((value: unknown): value is number => typeof value === 'number' && Number.isFinite(value));
  const price = closes[closes.length - 1] ?? null;
  const ma20 = smaOf(candles, 20);
  const ma50 = smaOf(candles, 50);
  const ma200 = smaOf(candles, 200);
  const rsi = calculateRsi(closes, 14);
  const change1D = pctChange(candles, 1);
  const change5D = pctChange(candles, 5);
  const change20D = pctChange(candles, 20);
  const vol20 = volatility20D(candles);

  let trend = 'Netral / konsolidasi';
  let trendTone = 'text-tv-yellow';
  if (price != null && ma20 && ma50 && price > ma20 && ma20 > ma50) {
    trend = 'Bullish jangka pendek';
    trendTone = 'text-tv-green';
  } else if (price != null && ma20 && ma50 && price < ma20 && ma20 < ma50) {
    trend = 'Bearish jangka pendek';
    trendTone = 'text-tv-red';
  }

  let structure = 'Struktur besar belum cukup data';
  if (price != null && ma50 && ma200) {
    if (price > ma50 && ma50 > ma200) structure = 'Uptrend utama masih sehat';
    else if (price < ma50 && ma50 < ma200) structure = 'Downtrend utama masih dominan';
    else if (price > ma200) structure = 'Masih di atas tren besar, tapi momentum belum rapi';
    else structure = 'Di bawah tren besar, pemulihan perlu konfirmasi';
  }

  let momentum = 'Momentum netral';
  let momentumTone = 'text-tv-yellow';
  if (rsi != null) {
    if (rsi >= 70) { momentum = 'Momentum kuat, mulai rawan jenuh beli'; momentumTone = 'text-tv-yellow'; }
    else if (rsi >= 55) { momentum = 'Momentum positif'; momentumTone = 'text-tv-green'; }
    else if (rsi <= 30) { momentum = 'Oversold, rawan technical rebound'; momentumTone = 'text-tv-yellow'; }
    else if (rsi < 45) { momentum = 'Momentum melemah'; momentumTone = 'text-tv-red'; }
  }

  const score =
    (change1D != null && change1D > 0 ? 1 : change1D != null && change1D < 0 ? -1 : 0) +
    (change5D != null && change5D > 0 ? 1 : change5D != null && change5D < 0 ? -1 : 0) +
    (change20D != null && change20D > 0 ? 1 : change20D != null && change20D < 0 ? -1 : 0) +
    (price != null && ma20 && price > ma20 ? 1 : price != null && ma20 && price < ma20 ? -1 : 0) +
    (price != null && ma50 && price > ma50 ? 1 : price != null && ma50 && price < ma50 ? -1 : 0) +
    (rsi != null && rsi >= 55 && rsi < 75 ? 1 : rsi != null && rsi < 45 ? -1 : 0);

  const sentiment = score >= 3 ? 'Positif' : score <= -3 ? 'Negatif' : 'Netral';
  const sentimentTone = sentiment === 'Positif'
    ? 'text-tv-green'
    : sentiment === 'Negatif'
      ? 'text-tv-red'
      : 'text-tv-yellow';
  const explanation = sentiment === 'Positif'
    ? 'Mayoritas indikator teknikal mendukung risk-on: harga dan momentum indeks cenderung menguat. Tetap tunggu konfirmasi volume dan level support/resistance.'
    : sentiment === 'Negatif'
      ? 'Mayoritas indikator teknikal menunjukkan tekanan: momentum indeks melemah atau posisi harga berada di bawah moving average penting. Fokus ke proteksi risiko dan tunggu konfirmasi pemulihan.'
      : 'Sinyal teknikal bercampur. IHSG belum memberi arah dominan, sehingga strategi lebih aman adalah selektif pada saham kuat dan menunggu breakout/breakdown yang jelas.';

  return {
    price, ma20, ma50, ma200, rsi, change1D, change5D, change20D, vol20,
    trend, trendTone, structure, momentum, momentumTone, sentiment, sentimentTone, explanation,
  };
}

export function buildDataFreshness(data: DashboardData | null) {
  const meta: DashboardFreshnessMeta | null = data?._meta ?? null;
  if (!meta) return null;
  const timestamp = meta.dataTimestamp ? new Date(meta.dataTimestamp) : null;
  const timeLabel = timestamp
    ? `${timestamp.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} WIB`
    : null;
  const isStaleCache = meta.source === 'stale-cache';
  const ageHours = typeof meta.ageSeconds === 'number' ? Math.round(meta.ageSeconds / 3600) : null;
  if (isStaleCache) {
    return {
      warn: true,
      label: `CACHE DARURAT${ageHours != null ? ` (~${ageHours} jam lalu)` : ''}`,
      detail: meta.staleReason || 'Sumber data sedang tidak bisa dihubungi - angka di halaman ini adalah data terakhir yang berhasil diambil, bukan kondisi pasar saat ini.',
    };
  }
  if (meta.freshness === 'STALE') {
    return { warn: true, label: `BASI${timeLabel ? ` - bar terakhir ${timeLabel}` : ''}`, detail: 'Bar harga terakhir dari sumber data lebih tua dari 1 hari bursa.' };
  }
  if (meta.freshness === 'EOD') return { warn: false, label: `Penutupan (EOD)${timeLabel ? ` - ${timeLabel}` : ''}`, detail: null };
  if (meta.freshness === 'DELAYED') return { warn: false, label: `Delayed ~15 menit${timeLabel ? ` - ${timeLabel}` : ''}`, detail: null };
  return { warn: true, label: 'Waktu data tidak diketahui', detail: 'Sumber data tidak mengirim timestamp bar harga.' };
}

export function computeBacktestAccuracy(data: DashboardData | null): Record<string, { pct: number; samples: number }> {
  const history: DashboardCandle[] = data?.stock?.history ?? [];
  if (history.length < 50) return {};

  const results: Record<string, { pct: number; samples: number }> = {};
  const validHistory = history.filter((item) => typeof item?.close === 'number' && Number.isFinite(item.close) && item.close > 0);
  if (validHistory.length < 50) return {};
  const closes: number[] = validHistory.map((item) => item.close);
  const horizon = 10;
  const targetGain = 1.03;
  const minSamples = 20;
  const record = (label: string, correct: number, total: number) => {
    if (total >= minSamples) results[label] = { pct: Math.round((correct / total) * 100), samples: total };
  };
  const hit = (index: number) => closes[Math.min(index + horizon, closes.length - 1)] > closes[index] * targetGain;

  let rsiCorrect = 0; let rsiTotal = 0;
  for (let index = 20; index < closes.length - horizon; index++) {
    const rsi = calculateRsi(closes.slice(0, index + 1), 14);
    if (rsi === null) continue;
    if (rsi >= 50 && rsi <= 70) { rsiTotal++; if (hit(index)) rsiCorrect++; }
  }
  record('RSI 14', rsiCorrect, rsiTotal);

  let volumeCorrect = 0; let volumeTotal = 0;
  const volumes: Array<number | null> = validHistory.map((item) =>
    typeof item?.volume === 'number' && Number.isFinite(item.volume) && item.volume >= 0 ? item.volume : null
  );
  for (let index = 20; index < closes.length - horizon; index++) {
    const window = volumes.slice(index - 20, index);
    const currentVolume = volumes[index];
    if (currentVolume == null || window.some((value) => value == null)) continue;
    const numericWindow = window as number[];
    const averageVolume = numericWindow.reduce((a, b) => a + b, 0) / numericWindow.length;
    if (averageVolume > 0 && currentVolume > averageVolume * 1.5 && closes[index] > closes[index - 1]) {
      volumeTotal++; if (hit(index)) volumeCorrect++;
    }
  }
  record('Volume vs Avg 20D', volumeCorrect, volumeTotal);

  let maCorrect = 0; let maTotal = 0;
  for (let index = 200; index < closes.length - horizon; index++) {
    const sma20 = closes.slice(index - 20, index).reduce((a, b) => a + b, 0) / 20;
    const sma50 = closes.slice(index - 50, index).reduce((a, b) => a + b, 0) / 50;
    const sma200 = closes.slice(index - 200, index).reduce((a, b) => a + b, 0) / 200;
    if (closes[index] > sma20 && sma20 > sma50 && sma50 > sma200) {
      maTotal++; if (hit(index)) maCorrect++;
    }
  }
  record('MA Trend IDX (20,50,200)', maCorrect, maTotal);

  let macdCorrect = 0; let macdTotal = 0;
  const ema12: number[] = [closes[0]];
  const ema26: number[] = [closes[0]];
  for (let index = 1; index < closes.length; index++) {
    ema12.push(closes[index] * (2 / 13) + ema12[index - 1] * (11 / 13));
    ema26.push(closes[index] * (2 / 27) + ema26[index - 1] * (25 / 27));
  }
  const macdLine = ema12.map((value: number, index: number) => value - ema26[index]);
  const signal: number[] = [macdLine[0]];
  for (let index = 1; index < macdLine.length; index++) {
    signal.push(macdLine[index] * (2 / 10) + signal[index - 1] * (8 / 10));
  }
  for (let index = 30; index < closes.length - horizon; index++) {
    if (macdLine[index] - signal[index] > 0) { macdTotal++; if (hit(index)) macdCorrect++; }
  }
  record('MACD (12,26,9)', macdCorrect, macdTotal);

  return results;
}

export function formatDashboardTime(date: Date | null) {
  if (!date) return '-';
  return `${new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)} WIB`;
}
