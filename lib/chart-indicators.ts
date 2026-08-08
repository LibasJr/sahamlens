export type ChartCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ChartType = 'candlestick' | 'bar' | 'line' | 'area' | 'baseline' | 'heikin-ashi';

export type IndicatorKind = 'SMA' | 'EMA' | 'BB' | 'VOLUME' | 'RSI' | 'MACD' | 'ATR' | 'CMF';

export type IndicatorConfig = {
  id: string;
  kind: IndicatorKind;
  period?: number;
  stdDev?: number;
  fast?: number;
  slow?: number;
  signal?: number;
  visible?: boolean;
};

export type IndicatorMeta = {
  kind: IndicatorKind;
  name: string;
  category: 'Trend' | 'Momentum' | 'Volatility' | 'Volume / Flow';
  pane: 'overlay' | 'oscillator';
  description: string;
};

export const INDICATOR_LIBRARY: IndicatorMeta[] = [
  { kind: 'SMA', name: 'Simple Moving Average', category: 'Trend', pane: 'overlay', description: 'Rata-rata harga penutupan sederhana.' },
  { kind: 'EMA', name: 'Exponential Moving Average', category: 'Trend', pane: 'overlay', description: 'Rata-rata bergerak dengan bobot lebih besar pada harga terbaru.' },
  { kind: 'BB', name: 'Bollinger Bands', category: 'Volatility', pane: 'overlay', description: 'Band volatilitas berbasis SMA dan standar deviasi.' },
  { kind: 'VOLUME', name: 'Volume', category: 'Volume / Flow', pane: 'oscillator', description: 'Volume transaksi dari OHLCV server.' },
  { kind: 'RSI', name: 'Relative Strength Index', category: 'Momentum', pane: 'oscillator', description: 'Momentum 0-100 dengan Wilder smoothing.' },
  { kind: 'MACD', name: 'MACD', category: 'Momentum', pane: 'oscillator', description: 'EMA cepat vs lambat beserta signal line dan histogram.' },
  { kind: 'ATR', name: 'Average True Range', category: 'Volatility', pane: 'oscillator', description: 'Volatilitas berbasis true range dengan Wilder smoothing.' },
  { kind: 'CMF', name: 'Chaikin Money Flow', category: 'Volume / Flow', pane: 'oscillator', description: 'Proxy tekanan akumulasi/distribusi dari harga dan volume.' },
];

export const DEFAULT_CHART_INDICATORS: IndicatorConfig[] = [
  { id: 'sma-50', kind: 'SMA', period: 50, visible: true },
  { id: 'sma-200', kind: 'SMA', period: 200, visible: true },
  { id: 'volume', kind: 'VOLUME', visible: true },
];

export function defaultIndicator(kind: IndicatorKind): IndicatorConfig {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  switch (kind) {
    case 'SMA': return { id: `sma-${suffix}`, kind, period: 20, visible: true };
    case 'EMA': return { id: `ema-${suffix}`, kind, period: 20, visible: true };
    case 'BB': return { id: `bb-${suffix}`, kind, period: 20, stdDev: 2, visible: true };
    case 'RSI': return { id: `rsi-${suffix}`, kind, period: 14, visible: true };
    case 'MACD': return { id: `macd-${suffix}`, kind, fast: 12, slow: 26, signal: 9, visible: true };
    case 'ATR': return { id: `atr-${suffix}`, kind, period: 14, visible: true };
    case 'CMF': return { id: `cmf-${suffix}`, kind, period: 20, visible: true };
    case 'VOLUME': return { id: `volume-${suffix}`, kind, visible: true };
  }
}

export function indicatorLabel(indicator: IndicatorConfig): string {
  switch (indicator.kind) {
    case 'SMA': return `SMA ${indicator.period ?? 20}`;
    case 'EMA': return `EMA ${indicator.period ?? 20}`;
    case 'BB': return `BB ${indicator.period ?? 20} · ${indicator.stdDev ?? 2}σ`;
    case 'RSI': return `RSI ${indicator.period ?? 14}`;
    case 'MACD': return `MACD ${indicator.fast ?? 12}/${indicator.slow ?? 26}/${indicator.signal ?? 9}`;
    case 'ATR': return `ATR ${indicator.period ?? 14}`;
    case 'CMF': return `CMF ${indicator.period ?? 20}`;
    case 'VOLUME': return 'Volume';
  }
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length);
}

export function heikinAshi(candles: ChartCandle[]): ChartCandle[] {
  if (candles.length === 0) return [];
  const out: ChartCandle[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    const close = (candle.open + candle.high + candle.low + candle.close) / 4;
    const open = i === 0
      ? (candle.open + candle.close) / 2
      : (out[i - 1].open + out[i - 1].close) / 2;
    out.push({
      ...candle,
      open,
      close,
      high: Math.max(candle.high, open, close),
      low: Math.min(candle.low, open, close),
    });
  }
  return out;
}

export function smaSeries(candles: ChartCandle[], period: number): Array<number | null> {
  const safePeriod = Math.max(1, Math.floor(period));
  const out: Array<number | null> = Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < candles.length; i += 1) {
    sum += candles[i].close;
    if (i >= safePeriod) sum -= candles[i - safePeriod].close;
    if (i >= safePeriod - 1) out[i] = sum / safePeriod;
  }
  return out;
}

export function emaValues(values: number[], period: number): Array<number | null> {
  const safePeriod = Math.max(1, Math.floor(period));
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length < safePeriod) return out;
  const seed = mean(values.slice(0, safePeriod));
  out[safePeriod - 1] = seed;
  const multiplier = 2 / (safePeriod + 1);
  let previous = seed;
  for (let i = safePeriod; i < values.length; i += 1) {
    previous = values[i] * multiplier + previous * (1 - multiplier);
    out[i] = previous;
  }
  return out;
}

export function emaSeries(candles: ChartCandle[], period: number): Array<number | null> {
  return emaValues(candles.map((candle) => candle.close), period);
}

export function bollingerSeries(candles: ChartCandle[], period: number, deviation: number) {
  const safePeriod = Math.max(2, Math.floor(period));
  const safeDeviation = Math.max(0.1, deviation);
  const middle = smaSeries(candles, safePeriod);
  const upper: Array<number | null> = Array(candles.length).fill(null);
  const lower: Array<number | null> = Array(candles.length).fill(null);
  for (let i = safePeriod - 1; i < candles.length; i += 1) {
    const window = candles.slice(i - safePeriod + 1, i + 1).map((candle) => candle.close);
    const sd = stdDev(window);
    const mid = middle[i];
    if (mid != null) {
      upper[i] = mid + safeDeviation * sd;
      lower[i] = mid - safeDeviation * sd;
    }
  }
  return { middle, upper, lower };
}

export function rsiSeries(candles: ChartCandle[], period: number): Array<number | null> {
  const safePeriod = Math.max(2, Math.floor(period));
  const out: Array<number | null> = Array(candles.length).fill(null);
  if (candles.length <= safePeriod) return out;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= safePeriod; i += 1) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / safePeriod;
  let avgLoss = losses / safePeriod;
  const toRsi = () => {
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  };
  out[safePeriod] = toRsi();
  for (let i = safePeriod + 1; i < candles.length; i += 1) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);
    avgGain = ((avgGain * (safePeriod - 1)) + gain) / safePeriod;
    avgLoss = ((avgLoss * (safePeriod - 1)) + loss) / safePeriod;
    out[i] = toRsi();
  }
  return out;
}

export function macdSeries(candles: ChartCandle[], fast: number, slow: number, signal: number) {
  const closes = candles.map((candle) => candle.close);
  const fastValues = emaValues(closes, Math.max(2, fast));
  const slowValues = emaValues(closes, Math.max(fast + 1, slow));
  const macd: Array<number | null> = closes.map((_, index) => {
    const fastValue = fastValues[index];
    const slowValue = slowValues[index];
    return fastValue != null && slowValue != null ? fastValue - slowValue : null;
  });

  const macdIndexes: number[] = [];
  const denseMacd: number[] = [];
  macd.forEach((value, index) => {
    if (value != null && finite(value)) {
      macdIndexes.push(index);
      denseMacd.push(value);
    }
  });
  const denseSignal = emaValues(denseMacd, Math.max(2, signal));
  const signalLine: Array<number | null> = Array(candles.length).fill(null);
  denseSignal.forEach((value, denseIndex) => {
    if (value != null) signalLine[macdIndexes[denseIndex]] = value;
  });
  const histogram = macd.map((value, index) => (
    value != null && signalLine[index] != null ? value - (signalLine[index] as number) : null
  ));
  return { macd, signal: signalLine, histogram };
}

export function atrSeries(candles: ChartCandle[], period: number): Array<number | null> {
  const safePeriod = Math.max(2, Math.floor(period));
  const out: Array<number | null> = Array(candles.length).fill(null);
  if (candles.length < safePeriod) return out;
  const trueRanges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });
  let atr = mean(trueRanges.slice(0, safePeriod));
  out[safePeriod - 1] = atr;
  for (let i = safePeriod; i < candles.length; i += 1) {
    atr = ((atr * (safePeriod - 1)) + trueRanges[i]) / safePeriod;
    out[i] = atr;
  }
  return out;
}

export function cmfSeries(candles: ChartCandle[], period: number): Array<number | null> {
  const safePeriod = Math.max(2, Math.floor(period));
  const out: Array<number | null> = Array(candles.length).fill(null);
  const mfv = candles.map((candle) => {
    const range = candle.high - candle.low;
    if (range === 0 || candle.volume <= 0) return 0;
    const multiplier = ((candle.close - candle.low) - (candle.high - candle.close)) / range;
    return multiplier * candle.volume;
  });
  let flowSum = 0;
  let volumeSum = 0;
  for (let i = 0; i < candles.length; i += 1) {
    flowSum += mfv[i];
    volumeSum += candles[i].volume;
    if (i >= safePeriod) {
      flowSum -= mfv[i - safePeriod];
      volumeSum -= candles[i - safePeriod].volume;
    }
    if (i >= safePeriod - 1) out[i] = volumeSum > 0 ? flowSum / volumeSum : 0;
  }
  return out;
}

export function latestFinite(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] != null && finite(values[i])) return values[i] as number;
  }
  return null;
}
