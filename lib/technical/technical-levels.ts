/**
 * Technical Levels, Multi-Timeframe Alignment, Candlestick Pattern Recognition,
 * and ATR Risk/Reward Trading Plan Calculator.
 *
 * Deterministic, rule-based mathematical calculations on historical OHLCV candles.
 */

export interface OHLCVCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Sesi berjalan dari meta provider; belum merupakan daily candle final. */
  sessionStatus?: 'COMPLETE' | 'PARTIAL';
  /** true bila open hanya proxy visual karena provider belum mengirim open sesi. */
  openEstimated?: boolean;
  openSource?: 'PROVIDER' | 'PREVIOUS_CLOSE_PROXY';
}

export type PivotMethod = 'CLASSIC' | 'FIBONACCI' | 'CAMARILLA';

export interface PivotLevels {
  method: PivotMethod;
  pp: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface Range52Week {
  high52w: number;
  low52w: number;
  currentPrice: number;
  positionPct: number; // 0% at 52w low, 100% at 52w high
}

export type TrendStatus = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'NA';

export interface TimeframeTrend {
  timeframe: 'SHORT_TERM' | 'MEDIUM_TERM' | 'LONG_TERM';
  label: string;
  status: TrendStatus;
  detail: string;
  benchmark: string;
}

export interface CandlestickPattern {
  id: string;
  name: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  description: string;
  /** Heuristic pattern grade; bukan probabilitas keberhasilan/backtest accuracy. */
  reliability: 'HIGH' | 'MEDIUM' | 'LOW';
  volumeConfirmed: boolean;
}

export interface TradingPlan {
  currentPrice: number;
  atr14: number;
  entryZone: [number, number]; // [support, currentPrice]
  stopLoss: number;
  riskAmount: number;
  riskPct: number;
  targetPrice1: number; // 1:2 R:R
  targetPrice2: number; // 1:3 R:R
  rewardPct1: number;
  rewardPct2: number;
  riskRewardRatio: string; // e.g. "1 : 2.5"
  bias: 'BULLISH_SETUP' | 'BEARISH_SETUP' | 'RANGE_BOUND';
}

export interface TechnicalSuiteResult {
  currentPrice: number;
  pivots: Record<PivotMethod, PivotLevels>;
  range52w: Range52Week | null;
  trends: TimeframeTrend[];
  patterns: CandlestickPattern[];
  tradingPlan: TradingPlan | null;
  dataQuality: {
    latestObservationPartial: boolean;
    latestOpenEstimated: boolean;
    patternAsOf: string | null;
    atrAsOf: string | null;
  };
}

/**
 * Calculate Pivot Points for Classic, Fibonacci, and Camarilla methods.
 */
export function calculatePivotPoints(high: number, low: number, close: number): Record<PivotMethod, PivotLevels> {
  const diff = high - low;
  const pp = (high + low + close) / 3;

  // Level pivot TIDAK dibulatkan ke rupiah penuh. Saham lapis bawah di BEI sering
  // punya rentang sesi cuma 2-3 rupiah, dan pembulatan integer membuat Classic,
  // Fibonacci, dan Camarilla jatuh ke angka yang persis sama sehingga pemilihan
  // metode jadi tidak ada artinya. Presisi 2 desimal dipertahankan di sini;
  // pembulatan untuk tampilan diputuskan di layer UI sesuai harga sahamnya.
  const round2 = (value: number) => Math.round(value * 100) / 100;

  // Classic Floor Pivots
  const classic: PivotLevels = {
    method: 'CLASSIC',
    pp: round2(pp),
    r1: round2(2 * pp - low),
    r2: round2(pp + diff),
    r3: round2(high + 2 * (pp - low)),
    s1: round2(2 * pp - high),
    s2: round2(pp - diff),
    s3: round2(low - 2 * (high - pp)),
  };

  // Fibonacci Pivots
  const fibonacci: PivotLevels = {
    method: 'FIBONACCI',
    pp: round2(pp),
    r1: round2(pp + 0.382 * diff),
    r2: round2(pp + 0.618 * diff),
    r3: round2(pp + 1.0 * diff),
    s1: round2(pp - 0.382 * diff),
    s2: round2(pp - 0.618 * diff),
    s3: round2(pp - 1.0 * diff),
  };

  // Camarilla Equation
  const camarilla: PivotLevels = {
    method: 'CAMARILLA',
    pp: round2(pp),
    r1: round2(close + diff * (1.1 / 12)),
    r2: round2(close + diff * (1.1 / 6)),
    r3: round2(close + diff * (1.1 / 4)),
    s1: round2(close - diff * (1.1 / 12)),
    s2: round2(close - diff * (1.1 / 6)),
    s3: round2(close - diff * (1.1 / 4)),
  };

  return {
    CLASSIC: classic,
    FIBONACCI: fibonacci,
    CAMARILLA: camarilla,
  };
}

/**
 * Calculate 52-week price range and current position percentage.
 */
export function calculate52WeekRange(candles: OHLCVCandle[]): Range52Week | null {
  if (candles.length === 0) return null;
  // Consider up to the last 250 trading days (~1 trading year)
  const windowCandles = candles.slice(-250);
  if (windowCandles.length === 0) return null;

  let high52w = -Infinity;
  let low52w = Infinity;

  for (const c of windowCandles) {
    if (c.high > high52w) high52w = c.high;
    if (c.low < low52w) low52w = c.low;
  }

  const currentPrice = windowCandles[windowCandles.length - 1].close;
  const spread = high52w - low52w;
  const positionPct = spread > 0 ? Math.round(((currentPrice - low52w) / spread) * 100) : 50;

  return {
    high52w,
    low52w,
    currentPrice,
    positionPct: Math.min(100, Math.max(0, positionPct)),
  };
}

/**
 * Simple Moving Average helper.
 */
function calculateSMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

/**
 * Exponential Moving Average helper.
 */
function calculateEMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Average True Range helper (14 periods).
 */
export function calculateATR(candles: OHLCVCandle[], period = 14): number | null {
  // Zero Dummy Policy: ATR membutuhkan setidaknya dua candle untuk menghitung
  // true range terhadap previous close. Jangan menciptakan rentang 100/90 saat
  // input kosong atau tidak cukup.
  if (candles.length < 2) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prevClose),
      Math.abs(current.low - prevClose)
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  if (slice.length === 0) return null;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * Calculate Multi-Timeframe Trend Matrix.
 */
export function calculateMultiTimeframeTrends(candles: OHLCVCandle[]): TimeframeTrend[] {
  if (candles.length < 20) return [];
  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1];

  const ema20 = calculateEMA(closes, 20);
  const ma50 = calculateSMA(closes, 50);
  const ma100 = calculateSMA(closes, 100);
  const ma200 = calculateSMA(closes, 200);

  const shortStatus: TrendStatus =
    ema20 != null ? (currentPrice > ema20 * 1.005 ? 'BULLISH' : currentPrice < ema20 * 0.995 ? 'BEARISH' : 'NEUTRAL') : 'NA';

  const medStatus: TrendStatus =
    ma50 != null && ma100 != null
      ? ma50 > ma100
        ? 'BULLISH'
        : ma50 < ma100
        ? 'BEARISH'
        : 'NEUTRAL'
      : ma50 != null
      ? currentPrice > ma50
        ? 'BULLISH'
        : 'BEARISH'
      : 'NA';

  const longStatus: TrendStatus =
    ma200 != null
      ? currentPrice > ma200 * 1.01
        ? 'BULLISH'
        : currentPrice < ma200 * 0.99
        ? 'BEARISH'
        : 'NEUTRAL'
      : 'NA';

  return [
    {
      timeframe: 'SHORT_TERM',
      label: 'Jangka Pendek (Daily)',
      status: shortStatus,
      detail:
        ema20 != null
          ? `Harga Rp ${currentPrice.toLocaleString('id-ID')} ${currentPrice >= ema20 ? 'di atas' : 'di bawah'} EMA 20 (Rp ${Math.round(ema20).toLocaleString('id-ID')})`
          : 'Data belum cukup',
      benchmark: 'EMA 20 Momentum',
    },
    {
      timeframe: 'MEDIUM_TERM',
      label: 'Jangka Menengah (Swing)',
      status: medStatus,
      detail:
        ma50 != null && ma100 != null
          ? `MA 50 (Rp ${Math.round(ma50).toLocaleString('id-ID')}) ${ma50 >= ma100 ? 'Golden Cross di atas' : 'Death Cross di bawah'} MA 100`
          : ma50 != null
          ? `Harga vs MA 50 (Rp ${Math.round(ma50).toLocaleString('id-ID')})`
          : 'Data belum cukup',
      benchmark: 'MA 50 / MA 100 Cross',
    },
    {
      timeframe: 'LONG_TERM',
      label: 'Jangka Panjang (Struktural)',
      status: longStatus,
      detail:
        ma200 != null
          ? `Harga ${currentPrice >= ma200 ? 'berada di zona Bullish di atas' : 'berada di zona Bearish di bawah'} MA 200 (Rp ${Math.round(ma200).toLocaleString('id-ID')})`
          : 'Data < 200 hari bursa',
      benchmark: 'MA 200 Institutional Line',
    },
  ];
}

function isCompletedPatternCandle(candle: OHLCVCandle): boolean {
  return (
    candle.sessionStatus !== 'PARTIAL' &&
    candle.openEstimated !== true &&
    Number.isFinite(candle.open) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low) &&
    Number.isFinite(candle.close) &&
    candle.open > 0 &&
    candle.high >= candle.low &&
    candle.close > 0
  );
}

/**
 * Detect candlestick patterns only on completed daily candles with observed open.
 * A live/partial daily candle can be shown on the chart, but its body is not final and
 * must not be promoted to a confirmed candlestick pattern.
 */
export function detectCandlestickPatterns(candles: OHLCVCandle[]): CandlestickPattern[] {
  const completed = candles.filter(isCompletedPatternCandle);
  if (completed.length < 3) return [];
  const patterns: CandlestickPattern[] = [];

  const c0 = completed.at(-1)!; // Latest completed session
  const c1 = completed.at(-2)!; // Prior completed session
  const c2 = completed.at(-3)!; // 2 completed sessions ago

  // Average volume of the 20 completed sessions preceding c0.
  const recentVolumes = completed.slice(-21, -1).map((c) => c.volume);
  const hasVolumeBaseline = recentVolumes.length === 20 && recentVolumes.every((v) => Number.isFinite(v) && v >= 0);
  const avgVol = hasVolumeBaseline ? recentVolumes.reduce((a, b) => a + b, 0) / 20 : null;
  const isHighVolume = avgVol != null && avgVol > 0 && Number.isFinite(c0.volume) && c0.volume > avgVol * 1.15;

  const body0 = Math.abs(c0.close - c0.open);
  const range0 = c0.high - c0.low;
  // Candle tanpa range tidak punya wick/body ratio yang bermakna. Jangan mengganti
  // range 0 dengan angka 1 karena itu menciptakan pola candlestick yang tidak terukur.
  if (!Number.isFinite(range0) || range0 <= 0) return [];
  const isBullish0 = c0.close > c0.open;
  const isBearish0 = c0.close < c0.open;

  const body1 = Math.abs(c1.close - c1.open);
  const range1 = c1.high - c1.low;
  const isBullish1 = c1.close > c1.open;
  const isBearish1 = c1.close < c1.open;

  const upperWick0 = c0.high - Math.max(c0.open, c0.close);
  const lowerWick0 = Math.min(c0.open, c0.close) - c0.low;

  // 1. Bullish Engulfing
  if (isBearish1 && isBullish0 && c0.open <= c1.close && c0.close >= c1.open && body0 > body1 * 1.05) {
    patterns.push({
      id: 'BULLISH_ENGULFING',
      name: 'Bullish Engulfing',
      sentiment: 'BULLISH',
      description: 'Candle hijau membungkus candle merah sebelumnya; secara rule-based menunjukkan pergeseran tekanan ke sisi beli dan tetap memerlukan konfirmasi konteks tren/volume.',
      reliability: 'HIGH',
      volumeConfirmed: isHighVolume,
    });
  }

  // 2. Bearish Engulfing
  if (isBullish1 && isBearish0 && c0.open >= c1.close && c0.close <= c1.open && body0 > body1 * 1.05) {
    patterns.push({
      id: 'BEARISH_ENGULFING',
      name: 'Bearish Engulfing',
      sentiment: 'BEARISH',
      description: 'Candle merah membungkus candle hijau sebelumnya; secara rule-based menunjukkan pergeseran tekanan ke sisi jual dan tetap memerlukan konfirmasi konteks tren/volume.',
      reliability: 'HIGH',
      volumeConfirmed: isHighVolume,
    });
  }

  // 3. Hammer (Bullish Pinbar at low)
  if (lowerWick0 >= body0 * 2.0 && upperWick0 <= range0 * 0.15 && body0 / range0 >= 0.15) {
    patterns.push({
      id: 'HAMMER',
      name: 'Hammer / Pinbar Bullish',
      sentiment: 'BULLISH',
      description: 'Ekor bawah panjang konsisten dengan rejection di area bawah; ini sinyal bentuk candle, bukan jaminan reversal.',
      reliability: 'MEDIUM',
      volumeConfirmed: isHighVolume,
    });
  }

  // 4. Shooting Star (Bearish Pinbar at high)
  if (upperWick0 >= body0 * 2.0 && lowerWick0 <= range0 * 0.15 && body0 / range0 >= 0.15) {
    patterns.push({
      id: 'SHOOTING_STAR',
      name: 'Shooting Star / Bearish Rejection',
      sentiment: 'BEARISH',
      description: 'Ekor atas panjang konsisten dengan rejection di area atas; ini sinyal bentuk candle, bukan jaminan reversal.',
      reliability: 'MEDIUM',
      volumeConfirmed: isHighVolume,
    });
  }

  // 5. Morning Star (3-bar bullish reversal)
  if (isBearish1 && isBullish0 && body1 > range1 * 0.4 && c0.close >= c1.open * 0.98) {
    // If c2 was also red
    if (c2.close < c2.open) {
      patterns.push({
        id: 'MORNING_STAR',
        name: 'Morning Star Pattern',
        sentiment: 'BULLISH',
        description: 'Formasi 3 candle konsisten dengan skenario bullish reversal; arah berikutnya tetap perlu konfirmasi sesi selanjutnya.',
        reliability: 'HIGH',
        volumeConfirmed: isHighVolume,
      });
    }
  }

  // 6. Doji (Indecision)
  if (body0 / range0 <= 0.08) {
    patterns.push({
      id: 'DOJI',
      name: 'Doji (Konsolidasi / Ragu)',
      sentiment: 'NEUTRAL',
      description: 'Badan sangat kecil menunjukkan indecision pada sesi tersebut; arah berikutnya belum dapat disimpulkan dari Doji saja.',
      reliability: 'LOW',
      volumeConfirmed: isHighVolume,
    });
  }

  // 7. Marubozu Bullish
  if (isBullish0 && body0 / range0 >= 0.85 && body0 > 0) {
    patterns.push({
      id: 'BULLISH_MARUBOZU',
      name: 'Bullish Marubozu (Full Body)',
      sentiment: 'BULLISH',
      description: 'Badan candle dominan dengan ekor kecil menunjukkan tekanan beli kuat pada sesi tersebut, tanpa menyiratkan probabilitas kelanjutan tertentu.',
      reliability: 'HIGH',
      volumeConfirmed: isHighVolume,
    });
  }

  return patterns;
}

/**
 * Calculate dynamic ATR-based Risk/Reward Trading Plan.
 */
export function calculateTradingPlan(
  candles: OHLCVCandle[],
  pivots: Record<PivotMethod, PivotLevels>,
  currentPriceOverride?: number
): TradingPlan | null {
  // ATR harian harus memakai sesi yang sudah lengkap. Harga entry/reference boleh
  // menggunakan observasi live terbaru karena itu angka provider nyata, bukan estimasi.
  const completed = candles.filter((c) => c.sessionStatus !== 'PARTIAL');
  if (completed.length < 14) return null;
  const currentPrice = Number.isFinite(currentPriceOverride) && (currentPriceOverride ?? 0) > 0
    ? currentPriceOverride!
    : completed[completed.length - 1].close;
  const atr = calculateATR(completed, 14);
  if (atr == null || !Number.isFinite(atr) || atr <= 0) return null;
  const atr14 = Math.round(atr);

  const classic = pivots.CLASSIC;
  const s1 = classic.s1;
  const r1 = classic.r1;
  const r2 = classic.r2;

  // Suggested stop loss is placed below nearest support by 1.25x ATR buffer
  const stopLoss = Math.max(1, Math.round(Math.min(s1, currentPrice - 1.25 * atr14)));
  const riskAmount = Math.max(1, currentPrice - stopLoss);
  const riskPct = Math.round((riskAmount / currentPrice) * 1000) / 10;

  // Target 1 = Current + 2x Risk (1:2 R:R) or nearest resistance R1
  const targetPrice1 = Math.round(Math.max(r1, currentPrice + 2 * riskAmount));
  const rewardPct1 = Math.round(((targetPrice1 - currentPrice) / currentPrice) * 1000) / 10;

  // Target 2 = Current + 3x Risk (1:3 R:R) or secondary resistance R2
  const targetPrice2 = Math.round(Math.max(r2, currentPrice + 3 * riskAmount));
  const rewardPct2 = Math.round(((targetPrice2 - currentPrice) / currentPrice) * 1000) / 10;

  const actualRatio = riskAmount > 0 ? (rewardPct1 / riskPct).toFixed(1) : '2.0';

  let bias: TradingPlan['bias'] = 'BULLISH_SETUP';
  if (currentPrice < classic.pp && currentPrice < s1) {
    bias = 'BEARISH_SETUP';
  } else if (Math.abs(currentPrice - classic.pp) / currentPrice < 0.01) {
    bias = 'RANGE_BOUND';
  }

  return {
    currentPrice,
    atr14,
    entryZone: [s1, currentPrice],
    stopLoss,
    riskAmount,
    riskPct,
    targetPrice1,
    targetPrice2,
    rewardPct1,
    rewardPct2,
    riskRewardRatio: `1 : ${actualRatio}`,
    bias,
  };
}

/**
 * Assemble comprehensive Technical Suite data.
 */
export function buildTechnicalSuite(candles: OHLCVCandle[]): TechnicalSuiteResult | null {
  if (!candles || candles.length < 5) return null;
  const latest = candles.at(-1)!;
  const completed = candles.filter((c) => c.sessionStatus !== 'PARTIAL');
  if (completed.length < 2) return null;

  // Saat sesi berjalan ada, pivot hari ini memakai sesi lengkap terakhir. Setelah daily
  // candle sudah final, perilaku lama dipertahankan: pivot memakai sesi sebelumnya.
  const pivotBase = latest.sessionStatus === 'PARTIAL'
    ? completed.at(-1)!
    : completed.at(-2)!;

  const pivots = calculatePivotPoints(pivotBase.high, pivotBase.low, pivotBase.close);
  const range52w = calculate52WeekRange(candles);
  const trends = calculateMultiTimeframeTrends(candles);
  const patterns = detectCandlestickPatterns(candles);
  const tradingPlan = calculateTradingPlan(candles, pivots, latest.close);
  const patternBase = completed.filter(isCompletedPatternCandle).at(-1) ?? null;

  return {
    currentPrice: latest.close,
    pivots,
    range52w,
    trends,
    patterns,
    tradingPlan,
    dataQuality: {
      latestObservationPartial: latest.sessionStatus === 'PARTIAL',
      latestOpenEstimated: latest.openEstimated === true,
      patternAsOf: patternBase?.time ?? null,
      atrAsOf: completed.at(-1)?.time ?? null,
    },
  };
}
