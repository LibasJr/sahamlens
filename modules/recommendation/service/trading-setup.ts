import { findStructuralZones, type SwingBar, type StructuralLevel } from '../../technical/service/analyzers/swing-levels';

export const MIN_LONG_RR = 1.5;
export const MIN_CONFIRMED_LEVEL_TOUCHES = 2;

export interface TradingSetupParameters {
  supportBufferAtr: number;
  minStopDistanceAtr: number;
  fallbackStopAtr: number;
  minLongRr: number;
  tp1R: number;
  tp2R: number;
}

export const DEFAULT_TRADING_SETUP_PARAMETERS: Readonly<TradingSetupParameters> = Object.freeze({
  supportBufferAtr: 0.25,
  minStopDistanceAtr: 0.75,
  fallbackStopAtr: 1.5,
  minLongRr: MIN_LONG_RR,
  tp1R: 2,
  tp2R: 3,
});

export type SupportQuality = 'CONFIRMED' | 'WEAK' | 'NONE';

export interface LongTradingSetup {
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  cl1: number;
  /** @deprecated Bukan CL kedua; hanya compatibility field untuk emergencyRiskLevel. */
  cl2: number;
  emergencyRiskLevel: number;
  rr: number;
  riskPct: number;
  riskAtr: number;
  support: StructuralLevel | null;
  nearestSupport: StructuralLevel | null;
  resistance: StructuralLevel | null;
  supportQuality: SupportQuality;
  stopSource: 'STRUCTURE_ATR' | 'ATR';
  parameters: TradingSetupParameters;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validParameters(input?: Partial<TradingSetupParameters>): TradingSetupParameters | null {
  const p: TradingSetupParameters = { ...DEFAULT_TRADING_SETUP_PARAMETERS, ...(input ?? {}) };
  if (
    !isFinitePositive(p.supportBufferAtr) ||
    !isFinitePositive(p.minStopDistanceAtr) ||
    !isFinitePositive(p.fallbackStopAtr) ||
    !isFinitePositive(p.minLongRr) ||
    !isFinitePositive(p.tp1R) ||
    !isFinitePositive(p.tp2R) ||
    p.tp1R < p.minLongRr ||
    p.tp2R <= p.tp1R
  ) return null;
  return p;
}

const IDX_TICK_BANDS: readonly [number, number][] = [
  [200, 1],
  [500, 2],
  [2000, 5],
  [5000, 10],
  [Infinity, 25],
];

export function idxTick(price: number): number {
  for (const [ceiling, tick] of IDX_TICK_BANDS) if (price < ceiling) return tick;
  return 25;
}

export function roundToIdxTick(value: number, mode: 'down' | 'up' | 'nearest'): number {
  const tick = idxTick(value);
  const quotient = value / tick;
  const rounded = mode === 'down'
    ? Math.floor(quotient)
    : mode === 'up'
      ? Math.ceil(quotient)
      : Math.round(quotient);
  return rounded * tick;
}

/**
 * Single Source of Truth untuk setup long.
 * Production caller tanpa override selalu memakai DEFAULT_TRADING_SETUP_PARAMETERS.
 * Override hanya untuk sensitivity research di TP/CL Validation Lab.
 */
export function buildLongTradingSetup(
  history: SwingBar[],
  currentPrice: number,
  atr: number | null | undefined,
  parameterOverrides?: Partial<TradingSetupParameters>,
): LongTradingSetup | null {
  if (!Array.isArray(history) || history.length < 15) return null;
  if (!isFinitePositive(currentPrice) || !isFinitePositive(atr)) return null;

  const parameters = validParameters(parameterOverrides);
  if (!parameters) return null;

  const zones = findStructuralZones(history, currentPrice);
  const nearestSupport = zones.support;
  const confirmedSupport =
    nearestSupport && nearestSupport.touches >= MIN_CONFIRMED_LEVEL_TOUCHES ? nearestSupport : null;

  const supportQuality: SupportQuality = confirmedSupport ? 'CONFIRMED' : nearestSupport ? 'WEAK' : 'NONE';

  const structuralStop = confirmedSupport
    ? confirmedSupport.price - atr * parameters.supportBufferAtr
    : null;
  const atrStop = currentPrice - atr * parameters.fallbackStopAtr;
  const stop = structuralStop != null
    ? Math.min(currentPrice - atr * parameters.minStopDistanceAtr, structuralStop)
    : atrStop;

  if (!Number.isFinite(stop) || stop <= 0 || stop >= currentPrice) return null;
  const risk = currentPrice - stop;
  if (!isFinitePositive(risk)) return null;

  const sortedResistance = zones.levels
    .filter((level) => level.price > currentPrice)
    .sort((a, b) => a.price - b.price);

  const firstResistance = sortedResistance[0] ?? null;
  const minTarget = currentPrice + risk * parameters.minLongRr;
  if (firstResistance && firstResistance.price < minTarget) return null;

  const defaultTp1 = currentPrice + risk * parameters.tp1R;
  const tp1Raw = firstResistance && firstResistance.price < defaultTp1
    ? firstResistance.price
    : defaultTp1;

  const targetAboveTp1 = sortedResistance.find((level) => level.price > tp1Raw);
  const tp2Raw = targetAboveTp1?.price ?? currentPrice + risk * parameters.tp2R;

  const entry = roundToIdxTick(currentPrice, 'nearest');
  const roundedStop = roundToIdxTick(stop, 'down');
  const tp1 = roundToIdxTick(tp1Raw, 'up');
  const tp2 = roundToIdxTick(tp2Raw, 'up');
  const emergencyRiskLevel = roundToIdxTick(currentPrice - risk * 2, 'down');

  const roundedRisk = entry - roundedStop;
  const roundedRr = roundedRisk > 0 ? (tp1 - entry) / roundedRisk : null;
  if (roundedRr == null || !Number.isFinite(roundedRr) || roundedRr < parameters.minLongRr) return null;

  return {
    entry,
    stop: roundedStop,
    tp1,
    tp2,
    cl1: roundedStop,
    cl2: emergencyRiskLevel,
    emergencyRiskLevel,
    rr: parseFloat(roundedRr.toFixed(2)),
    riskPct: parseFloat(((roundedRisk / entry) * 100).toFixed(2)),
    riskAtr: parseFloat((roundedRisk / atr).toFixed(2)),
    support: confirmedSupport,
    nearestSupport,
    resistance: firstResistance,
    supportQuality,
    stopSource: confirmedSupport ? 'STRUCTURE_ATR' : 'ATR',
    parameters,
  };
}
