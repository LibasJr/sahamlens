import {
  buildLongTradingSetup,
  roundToIdxTick,
  type LongTradingSetup,
  type TradingSetupParameters,
} from './trading-setup';
import type { SwingBar } from '../../technical/service/analyzers/swing-levels';

export const HYBRID_V2_VERSION = 'HYBRID_V2_SHADOW_1';

export type HybridMarketRegime = 'UPTREND' | 'SIDEWAYS' | 'DOWNTREND' | 'UNKNOWN';
export type HybridVolatilityRegime = 'LOW' | 'NORMAL' | 'HIGH';

export interface HybridV2TradingSetup extends LongTradingSetup {
  engine: 'HYBRID_V2';
  version: typeof HYBRID_V2_VERSION;
  calibrationStatus: 'SHADOW_UNCALIBRATED';
  marketRegime: HybridMarketRegime;
  volatilityRegime: HybridVolatilityRegime;
  atrPercentile: number;
  trailingMethod: 'CHANDELIER_22';
  suggestedTrailingStop: number | null;
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function closesOf(history: SwingBar[]): number[] {
  return history.map((bar) => finitePositive(bar.AdjClose) ? bar.AdjClose : bar.Close).filter(finitePositive);
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function classifyHybridMarketRegime(history: SwingBar[]): HybridMarketRegime {
  const closes = closesOf(history);
  if (closes.length < 55) return 'UNKNOWN';
  const ma20 = average(closes.slice(-20));
  const ma50 = average(closes.slice(-50));
  const priorMa20 = average(closes.slice(-25, -5));
  const current = closes[closes.length - 1];
  if (!finitePositive(ma20) || !finitePositive(ma50) || !finitePositive(priorMa20) || !finitePositive(current)) return 'UNKNOWN';
  if (current > ma20 && ma20 > ma50 && ma20 > priorMa20) return 'UPTREND';
  if (current < ma20 && ma20 < ma50 && ma20 < priorMa20) return 'DOWNTREND';
  return 'SIDEWAYS';
}

function trueRanges(history: SwingBar[]): number[] {
  const out: number[] = [];
  for (let index = 1; index < history.length; index++) {
    const bar = history[index]!;
    const previousClose = history[index - 1]!.Close;
    if (![bar.High, bar.Low, previousClose].every(finitePositive)) continue;
    out.push(Math.max(bar.High - bar.Low, Math.abs(bar.High - previousClose), Math.abs(bar.Low - previousClose)));
  }
  return out;
}

export function classifyHybridVolatility(
  history: SwingBar[],
  atr: number,
): { regime: HybridVolatilityRegime; percentile: number } | null {
  const sample = trueRanges(history).slice(-120).filter(finitePositive).sort((a, b) => a - b);
  // Missing sample bukan "NORMAL/50". Nilai 50 adalah angka statistik yang bermakna
  // percentile median, jadi memakainya sebagai fallback akan memalsukan observasi.
  if (!sample.length || !finitePositive(atr)) return null;
  const belowOrEqual = sample.filter((value) => value <= atr).length;
  const percentile = Math.round((belowOrEqual / sample.length) * 100);
  return { regime: percentile >= 75 ? 'HIGH' : percentile <= 25 ? 'LOW' : 'NORMAL', percentile };
}

export function hybridV2Parameters(
  market: HybridMarketRegime,
  volatility: HybridVolatilityRegime,
): TradingSetupParameters | null {
  if (market === 'DOWNTREND' || market === 'UNKNOWN') return null;
  const base: TradingSetupParameters = market === 'UPTREND'
    ? { supportBufferAtr: 0.3, minStopDistanceAtr: 0.75, fallbackStopAtr: 1.6, minLongRr: 1.5, tp1R: 2, tp2R: 3.5 }
    : { supportBufferAtr: 0.2, minStopDistanceAtr: 0.6, fallbackStopAtr: 1.25, minLongRr: 1.5, tp1R: 1.5, tp2R: 2.25 };
  const factor = volatility === 'HIGH' ? 1.25 : volatility === 'LOW' ? 0.85 : 1;
  return {
    ...base,
    supportBufferAtr: Number((base.supportBufferAtr * factor).toFixed(3)),
    minStopDistanceAtr: Number((base.minStopDistanceAtr * factor).toFixed(3)),
    fallbackStopAtr: Number((base.fallbackStopAtr * factor).toFixed(3)),
  };
}

/**
 * Mesin riset paralel. Belum boleh menjadi advisory sebelum TP/CL Validation Lab
 * memberi parameter frozen yang lolos out-of-sample, biaya, dan slippage.
 */
export function buildHybridV2TradingSetup(
  history: SwingBar[],
  currentPrice: number,
  atr: number | null | undefined,
): HybridV2TradingSetup | null {
  if (!Array.isArray(history) || history.length < 55 || !finitePositive(currentPrice) || !finitePositive(atr)) return null;
  const marketRegime = classifyHybridMarketRegime(history);
  const volatility = classifyHybridVolatility(history, atr);
  if (!volatility) return null;
  const parameters = hybridV2Parameters(marketRegime, volatility.regime);
  if (!parameters) return null;
  const baseline = buildLongTradingSetup(history, currentPrice, atr, parameters);
  if (!baseline) return null;

  const highest22 = Math.max(...history.slice(-22).map((bar) => bar.High).filter(finitePositive));
  const rawTrailing = highest22 - atr * 3;
  const suggestedTrailingStop = finitePositive(rawTrailing) && rawTrailing < currentPrice
    ? roundToIdxTick(rawTrailing, 'down')
    : null;

  return {
    ...baseline,
    engine: 'HYBRID_V2',
    version: HYBRID_V2_VERSION,
    calibrationStatus: 'SHADOW_UNCALIBRATED',
    marketRegime,
    volatilityRegime: volatility.regime,
    atrPercentile: volatility.percentile,
    trailingMethod: 'CHANDELIER_22',
    suggestedTrailingStop,
  };
}
