export const MARKET_REGIME_WEIGHTS = {
  trend: 25,
  breadth: 25,
  momentum: 20,
  volatility: 15,
  participation: 15,
} as const;

export type MarketRegimeIndicatorId = keyof typeof MARKET_REGIME_WEIGHTS;

export type MarketRegimeIndicator = {
  id: MarketRegimeIndicatorId;
  label: string;
  score: number | null;
  weight: number;
  effectiveWeight: number;
  contribution: number;
  confidence: number;
  signal: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'UNAVAILABLE';
  method: string;
  raw: Record<string, number | null>;
};

export type QuantitativeMarketRegime = {
  methodologyVersion: 'sahamlens-regime-v1';
  asOf: string;
  score: number | null;
  fearGreed: {
    code: 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED' | 'DATA_LIMITED';
    label: string;
  };
  regime: {
    code:
      | 'BULL_EXPANSION'
      | 'BULL_NARROW'
      | 'RISK_ON'
      | 'NEUTRAL'
      | 'DIVERGENCE'
      | 'HIGH_VOL_TRANSITION'
      | 'RISK_OFF'
      | 'BEAR_STRESS'
      | 'DATA_LIMITED';
    label: string;
    posture: 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' | 'WAIT_FOR_DATA';
  };
  confidence: number;
  coverage: number;
  summary: string;
  indicators: MarketRegimeIndicator[];
  dataQuality: {
    historyDays: number;
    breadthObserved: number;
    breadthExpected: number;
    indicesObserved: number;
    sectorsObserved: number;
  };
  limitations: string[];
};

export type RegimeDailyBar = {
  date: string;
  close: number;
};

export type MarketRegimeInput = {
  asOf?: string;
  ihsgHistory?: RegimeDailyBar[];
  breadth?: {
    advancing: number;
    declining: number;
    unchanged: number;
    total: number;
    expectedTotal?: number;
  } | null;
  indices?: Array<{ name: string; changePct: number | null }>;
  sectors?: Array<{ sector: string; changePct: number | null }>;
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function linearScore(value: number, bearish: number, bullish: number): number {
  if (bullish === bearish) return 50;
  return clamp(((value - bearish) / (bullish - bearish)) * 100);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function simpleMovingAverage(values: number[], period: number, endOffset = 0): number | null {
  const end = values.length - endOffset;
  const start = end - period;
  if (start < 0 || end <= 0) return null;
  return mean(values.slice(start, end));
}

function rateOfChange(values: number[], period: number): number | null {
  if (values.length <= period) return null;
  const start = values[values.length - 1 - period];
  const end = values[values.length - 1];
  if (!start || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  return ((end / start) - 1) * 100;
}

function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  const window = values.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let index = 1; index < window.length; index += 1) {
    const change = window[index] - window[index - 1];
    if (change > 0) gains += change;
    if (change < 0) losses += Math.abs(change);
  }
  if (losses === 0) return gains > 0 ? 100 : 50;
  const relativeStrength = (gains / period) / (losses / period);
  return 100 - (100 / (1 + relativeStrength));
}

function dailyLogReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    if (closes[index - 1] > 0 && closes[index] > 0) {
      returns.push(Math.log(closes[index] / closes[index - 1]));
    }
  }
  return returns;
}

function annualizedVolatility(returns: number[]): number | null {
  if (returns.length < 2) return null;
  const average = mean(returns);
  if (average == null) return null;
  const variance = returns.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function rollingVolatilityPercentile(closes: number[], window = 20): {
  currentVolatility: number | null;
  percentile: number | null;
} {
  const returns = dailyLogReturns(closes);
  if (returns.length < window * 2) return { currentVolatility: null, percentile: null };

  const observations: number[] = [];
  for (let end = window; end <= returns.length; end += 1) {
    const volatility = annualizedVolatility(returns.slice(end - window, end));
    if (volatility != null && Number.isFinite(volatility)) observations.push(volatility);
  }
  if (observations.length < window) return { currentVolatility: null, percentile: null };

  const currentVolatility = observations[observations.length - 1];
  const less = observations.filter((value) => value < currentVolatility).length;
  const equal = observations.filter((value) => Math.abs(value - currentVolatility) < 1e-10).length;
  const percentile = ((less + (0.5 * equal)) / observations.length) * 100;
  return { currentVolatility, percentile };
}

function indicatorSignal(score: number | null): MarketRegimeIndicator['signal'] {
  if (score == null) return 'UNAVAILABLE';
  if (score >= 60) return 'POSITIVE';
  if (score <= 40) return 'NEGATIVE';
  return 'NEUTRAL';
}

function buildIndicator(
  id: MarketRegimeIndicatorId,
  label: string,
  score: number | null,
  confidence: number,
  method: string,
  raw: Record<string, number | null>,
): MarketRegimeIndicator {
  return {
    id,
    label,
    score: score == null ? null : Math.round(clamp(score)),
    weight: MARKET_REGIME_WEIGHTS[id],
    effectiveWeight: 0,
    contribution: 0,
    confidence: Math.round(clamp(confidence)),
    signal: indicatorSignal(score),
    method,
    raw,
  };
}

function classifyFearGreed(score: number | null, confidence: number): QuantitativeMarketRegime['fearGreed'] {
  if (score == null || confidence < 50) return { code: 'DATA_LIMITED', label: 'Data terbatas' };
  if (score < 20) return { code: 'EXTREME_FEAR', label: 'Extreme Fear' };
  if (score < 40) return { code: 'FEAR', label: 'Fear' };
  if (score < 60) return { code: 'NEUTRAL', label: 'Neutral' };
  if (score < 80) return { code: 'GREED', label: 'Greed' };
  return { code: 'EXTREME_GREED', label: 'Extreme Greed' };
}

function classifyRegime(
  score: number | null,
  confidence: number,
  indicatorMap: Partial<Record<MarketRegimeIndicatorId, number>>,
): QuantitativeMarketRegime['regime'] {
  if (score == null || confidence < 50) {
    return { code: 'DATA_LIMITED', label: 'Data belum memadai', posture: 'WAIT_FOR_DATA' };
  }

  const trend = indicatorMap.trend ?? 50;
  const breadth = indicatorMap.breadth ?? 50;
  const volatility = indicatorMap.volatility ?? 50;
  const participation = indicatorMap.participation ?? 50;

  if (score <= 25 && volatility <= 30) {
    return { code: 'BEAR_STRESS', label: 'Bear Stress', posture: 'RISK_OFF' };
  }
  if (score < 40) {
    return { code: 'RISK_OFF', label: 'Risk-Off', posture: 'RISK_OFF' };
  }
  if (score >= 75 && trend >= 65 && breadth >= 60 && participation >= 55) {
    return { code: 'BULL_EXPANSION', label: 'Bull Expansion', posture: 'RISK_ON' };
  }
  if (score >= 60 && trend >= 60 && breadth < 50) {
    return { code: 'BULL_NARROW', label: 'Bull Narrow / Rapuh', posture: 'NEUTRAL' };
  }
  if (score >= 60) {
    return { code: 'RISK_ON', label: 'Risk-On', posture: 'RISK_ON' };
  }
  if (volatility < 35) {
    return { code: 'HIGH_VOL_TRANSITION', label: 'High-Vol Transition', posture: 'RISK_OFF' };
  }
  if ((trend >= 60 && breadth <= 40) || (trend <= 40 && breadth >= 60)) {
    return { code: 'DIVERGENCE', label: 'Divergence', posture: 'NEUTRAL' };
  }
  return { code: 'NEUTRAL', label: 'Neutral / Sideways', posture: 'NEUTRAL' };
}

function regimeSummary(
  regime: QuantitativeMarketRegime['regime'],
  fearGreed: QuantitativeMarketRegime['fearGreed'],
): string {
  switch (regime.code) {
    case 'BULL_EXPANSION':
      return 'Tren, momentum, breadth, dan partisipasi menguat bersama. Kondisi risk-on memiliki konfirmasi yang luas.';
    case 'BULL_NARROW':
      return 'Indeks menguat tetapi breadth tertinggal. Kenaikan terkonsentrasi dan lebih rentan terhadap pembalikan.';
    case 'RISK_ON':
      return 'Mayoritas indikator mendukung risk-on, tetapi konfirmasinya belum cukup kuat untuk disebut ekspansi penuh.';
    case 'BEAR_STRESS':
      return 'Tekanan tren dan breadth terjadi bersama lonjakan volatilitas. Prioritas utama adalah kontrol risiko.';
    case 'RISK_OFF':
      return 'Indikator komposit condong defensif. Kekuatan harga belum mendapat konfirmasi yang memadai.';
    case 'HIGH_VOL_TRANSITION':
      return 'Arah pasar belum dominan sementara volatilitas relatif tinggi. Sinyal lebih mudah berubah.';
    case 'DIVERGENCE':
      return 'Tren indeks dan partisipasi saham tidak sejalan. Tunggu konfirmasi sebelum membaca arah sebagai regime baru.';
    case 'DATA_LIMITED':
      return 'Skor sementara tersedia, tetapi cakupan data belum cukup untuk menetapkan regime dengan keyakinan wajar.';
    default:
      return 'Pasar berada di area transisi. Belum ada kombinasi indikator yang cukup dominan untuk risk-on atau risk-off.';
  }
}

export function computeQuantitativeMarketRegime(input: MarketRegimeInput): QuantitativeMarketRegime {
  const history = (input.ihsgHistory ?? [])
    .filter((bar) => Number.isFinite(bar.close) && bar.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const closes = history.map((bar) => bar.close);
  const lastClose = closes[closes.length - 1] ?? null;
  const ma20 = simpleMovingAverage(closes, 20);
  const ma50 = simpleMovingAverage(closes, 50);
  const priorMa20 = simpleMovingAverage(closes, 20, 10);
  const ma20Slope10d = ma20 != null && priorMa20 != null && priorMa20 !== 0
    ? ((ma20 / priorMa20) - 1) * 100
    : null;

  let trendScore: number | null = null;
  if (lastClose != null && ma20 != null && ma50 != null && ma20Slope10d != null) {
    const priceVsMa50 = ((lastClose / ma50) - 1) * 100;
    const maAlignment = ((ma20 / ma50) - 1) * 100;
    trendScore =
      (linearScore(priceVsMa50, -8, 8) * 0.4) +
      (linearScore(maAlignment, -4, 4) * 0.3) +
      (linearScore(ma20Slope10d, -3, 3) * 0.3);
  }

  const roc5 = rateOfChange(closes, 5);
  const roc20 = rateOfChange(closes, 20);
  const rsi14 = rsi(closes, 14);
  const momentumScore = roc5 != null && roc20 != null && rsi14 != null
    ? (linearScore(roc5, -5, 5) * 0.3) +
      (linearScore(roc20, -10, 10) * 0.4) +
      (linearScore(rsi14, 30, 70) * 0.3)
    : null;

  const volatility = rollingVolatilityPercentile(closes);
  const volatilityScore = volatility.percentile == null ? null : 100 - volatility.percentile;

  const breadth = input.breadth;
  const directionalBreadthTotal = breadth ? breadth.advancing + breadth.declining : 0;
  const advanceShare = directionalBreadthTotal > 0 && breadth
    ? (breadth.advancing / directionalBreadthTotal) * 100
    : null;
  const breadthScore = advanceShare == null ? null : linearScore(advanceShare, 25, 75);

  const validIndices = (input.indices ?? []).filter((item) => typeof item.changePct === 'number');
  const validSectors = (input.sectors ?? []).filter((item) => typeof item.changePct === 'number');
  const indexPositiveShare = validIndices.length > 0
    ? (validIndices.filter((item) => (item.changePct as number) > 0).length / validIndices.length) * 100
    : null;
  const sectorPositiveShare = validSectors.length > 0
    ? (validSectors.filter((item) => (item.changePct as number) > 0).length / validSectors.length) * 100
    : null;

  const ihsgChange = validIndices.find((item) => item.name === 'IHSG')?.changePct ?? null;
  const largeCapChanges = validIndices
    .filter((item) => item.name === 'LQ45' || item.name === 'IDX30')
    .map((item) => item.changePct as number);
  const largeCapAverage = mean(largeCapChanges);
  const largeCapRelative = ihsgChange != null && largeCapAverage != null
    ? largeCapAverage - ihsgChange
    : null;

  const participationParts: Array<{ score: number; weight: number }> = [];
  if (indexPositiveShare != null) participationParts.push({ score: indexPositiveShare, weight: 45 });
  if (sectorPositiveShare != null) participationParts.push({ score: sectorPositiveShare, weight: 35 });
  if (largeCapRelative != null) participationParts.push({ score: linearScore(largeCapRelative, -1.5, 1.5), weight: 20 });
  const participationWeight = participationParts.reduce((sum, part) => sum + part.weight, 0);
  const participationScore = participationWeight > 0
    ? participationParts.reduce((sum, part) => sum + (part.score * part.weight), 0) / participationWeight
    : null;

  const expectedBreadth = breadth?.expectedTotal ?? breadth?.total ?? 0;
  const historyQuality = clamp((history.length / 120) * 100);
  const breadthQuality = breadth && expectedBreadth > 0
    ? clamp((breadth.total / expectedBreadth) * 100)
    : 0;
  const participationQuality = mean([
    clamp((validIndices.length / 4) * 100),
    clamp((validSectors.length / 11) * 100),
  ]) ?? 0;

  const indicators = [
    buildIndicator('trend', 'Trend', trendScore, historyQuality, 'Harga vs MA50, alignment MA20/MA50, dan slope MA20 10 hari.', {
      close: lastClose,
      ma20,
      ma50,
      ma20Slope10d,
    }),
    buildIndicator('breadth', 'Breadth', breadthScore, breadthQuality, 'Persentase saham naik dari saham yang bergerak naik atau turun.', {
      advanceShare,
      advancing: breadth?.advancing ?? null,
      declining: breadth?.declining ?? null,
    }),
    buildIndicator('momentum', 'Momentum', momentumScore, historyQuality, 'Gabungan return 5 hari, return 20 hari, dan RSI14.', {
      return5d: roc5,
      return20d: roc20,
      rsi14,
    }),
    buildIndicator('volatility', 'Volatility', volatilityScore, historyQuality, 'Kebalikan percentile realized volatility 20 hari dalam histori tersedia.', {
      realizedVol20d: volatility.currentVolatility,
      volatilityPercentile: volatility.percentile,
    }),
    buildIndicator('participation', 'Participation', participationScore, participationQuality, 'Konfirmasi indeks, sektor positif, dan leadership saham berkapitalisasi besar.', {
      indexPositiveShare,
      sectorPositiveShare,
      largeCapRelative,
    }),
  ];

  const available = indicators.filter((indicator) => indicator.score != null);
  const availableWeight = available.reduce((sum, indicator) => sum + indicator.weight, 0);
  const score = availableWeight > 0
    ? available.reduce((sum, indicator) => sum + ((indicator.score as number) * indicator.weight), 0) / availableWeight
    : null;

  for (const indicator of indicators) {
    if (indicator.score == null || availableWeight === 0) continue;
    indicator.effectiveWeight = Number(((indicator.weight / availableWeight) * 100).toFixed(1));
    indicator.contribution = Number((((indicator.score as number) * indicator.weight) / availableWeight).toFixed(1));
  }

  const availableDataQuality = availableWeight > 0
    ? available.reduce((sum, indicator) => sum + (indicator.confidence * indicator.weight), 0) /
      availableWeight
    : 0;
  // Confidence menggabungkan kualitas data YANG ADA dan kelengkapan bobot. Tanpa
  // breadth/participation, histori yang sempurna tidak boleh terlihat seperti 95%
  // confidence untuk keseluruhan regime.
  const confidence = Math.round(Math.min(
    95,
    availableDataQuality * (availableWeight / 100),
  ));
  const coverage = Math.round(availableWeight);
  const roundedScore = score == null ? null : Math.round(clamp(score));
  const indicatorMap = Object.fromEntries(
    available.map((indicator) => [indicator.id, indicator.score as number]),
  ) as Partial<Record<MarketRegimeIndicatorId, number>>;
  const fearGreed = classifyFearGreed(roundedScore, confidence);
  const regime = classifyRegime(roundedScore, confidence, indicatorMap);

  return {
    methodologyVersion: 'sahamlens-regime-v1',
    asOf: input.asOf ?? new Date().toISOString(),
    score: roundedScore,
    fearGreed,
    regime,
    confidence,
    coverage,
    summary: regimeSummary(regime, fearGreed),
    indicators,
    dataQuality: {
      historyDays: history.length,
      breadthObserved: breadth?.total ?? 0,
      breadthExpected: expectedBreadth,
      indicesObserved: validIndices.length,
      sectorsObserved: validSectors.length,
    },
    limitations: [
      'Breadth dihitung dari sampel saham SahamLens, bukan seluruh emiten IDX.',
      'Sector participation memakai rata-rata saham wakil, bukan indeks sektor resmi.',
      'Skor mengukur kondisi pasar saat ini dan bukan prediksi return masa depan.',
    ],
  };
}
