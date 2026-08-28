import { buildLongTradingSetup, type LongTradingSetup } from './trading-setup';
import type { SwingBar, StructuralLevel } from '../../technical/service/analyzers/swing-levels';

export const TRADE_PLAN_VERSION = 'TRADE_PLAN_V1_0';
export const TRADE_PLAN_ENTRY_REFERENCE = 'OPEN_H_PLUS_1';

export type TradePlanRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type TradePlanConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TradePlanInputs {
  history: SwingBar[];
  currentPrice: number;
  atr: number | null | undefined;
  adx?: number | null;
  plusDi?: number | null;
  minusDi?: number | null;
  bollingerPercentB?: number | null;
  volumeRatio?: number | null;
  officialNetPressure20?: number | null;
  officialPositiveRatio20?: number | null;
}

export interface TradePlanDataPoint {
  key: 'structure' | 'atr' | 'riskReward' | 'adxDmi' | 'bollinger' | 'volume' | 'idxForeignFlow';
  label: string;
  status: 'AVAILABLE' | 'NOT_AVAILABLE';
  source: 'PRICE_OHLC' | 'VOLUME_OHLC' | 'IDX_OFFICIAL_FOREIGN_FLOW';
  value: number | string | null;
}

export interface TradePlanV1 {
  version: typeof TRADE_PLAN_VERSION;
  entryReference: typeof TRADE_PLAN_ENTRY_REFERENCE;
  entry: number;
  stopLoss: number;
  cutLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  riskPercent: number;
  riskAtr: number;
  riskLevel: TradePlanRiskLevel;
  confidenceScore: number;
  confidenceLevel: TradePlanConfidenceLevel;
  support: StructuralLevel | null;
  nearestSupport: StructuralLevel | null;
  resistance: StructuralLevel | null;
  reasons: string[];
  missingData: string[];
  caveats: string[];
  dataPoints: TradePlanDataPoint[];
  legacySetup: LongTradingSetup;
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function riskLevel(setup: LongTradingSetup): TradePlanRiskLevel {
  if (setup.riskPct <= 4 && setup.riskAtr <= 1.25) return 'LOW';
  if (setup.riskPct <= 8 && setup.riskAtr <= 2.25) return 'MEDIUM';
  return 'HIGH';
}

function confidenceLevel(score: number, missingData: string[]): TradePlanConfidenceLevel {
  if (score >= 75 && missingData.length <= 1) return 'HIGH';
  if (score >= 55) return 'MEDIUM';
  return 'LOW';
}

function dataPoint(
  key: TradePlanDataPoint['key'],
  label: string,
  source: TradePlanDataPoint['source'],
  value: number | string | null,
): TradePlanDataPoint {
  return {
    key,
    label,
    source,
    value,
    status: value == null ? 'NOT_AVAILABLE' : 'AVAILABLE',
  };
}

export function buildTradePlanV1(input: TradePlanInputs): TradePlanV1 | null {
  const setup = buildLongTradingSetup(input.history, input.currentPrice, input.atr);
  if (!setup) return null;

  const reasons: string[] = [];
  const missingData: string[] = [];
  const caveats: string[] = [
    'TradePlan adalah rencana risiko berbasis data historis, bukan jaminan harga tercapai.',
    'Entry memakai Open H+1 setelah sinyal EOD; realisasi bisa berbeda karena gap dan slippage.',
  ];

  let points = 0;
  let availableMax = 0;

  availableMax += 25;
  if (setup.supportQuality === 'CONFIRMED') {
    points += 25;
    reasons.push(`Support struktural terkonfirmasi di ${setup.support?.price ?? setup.nearestSupport?.price}.`);
  } else if (setup.supportQuality === 'WEAK') {
    points += 12;
    reasons.push(`Support terdekat masih lemah di ${setup.nearestSupport?.price}; stop memakai ATR lebih dominan.`);
  } else {
    missingData.push('Support struktural terkonfirmasi');
  }

  availableMax += 20;
  if (setup.rr >= 2.5) {
    points += 20;
    reasons.push(`Risk/reward kuat di 1:${setup.rr}.`);
  } else if (setup.rr >= 2) {
    points += 16;
    reasons.push(`Risk/reward sehat di 1:${setup.rr}.`);
  } else {
    points += 10;
    reasons.push(`Risk/reward minimum lolos di 1:${setup.rr}.`);
  }

  availableMax += 15;
  if (riskLevel(setup) === 'LOW') {
    points += 15;
    reasons.push(`Risiko posisi rendah: ${setup.riskPct}% dari entry.`);
  } else if (riskLevel(setup) === 'MEDIUM') {
    points += 10;
    reasons.push(`Risiko posisi sedang: ${setup.riskPct}% dari entry.`);
  } else {
    points += 4;
    reasons.push(`Risiko posisi tinggi: ${setup.riskPct}% dari entry.`);
  }

  if (finitePositive(input.adx) && finiteNumber(input.plusDi) && finiteNumber(input.minusDi)) {
    availableMax += 15;
    if (input.adx >= 25 && input.plusDi > input.minusDi) {
      points += 15;
      reasons.push(`ADX/DMI mendukung tren naik: ADX ${input.adx.toFixed(1)}, +DI di atas -DI.`);
    } else if (input.adx >= 20 && input.plusDi >= input.minusDi) {
      points += 9;
      reasons.push(`ADX/DMI cukup mendukung, tetapi tren belum kuat penuh.`);
    } else {
      points += 3;
      caveats.push('ADX/DMI belum mengonfirmasi tren naik yang kuat.');
    }
  } else {
    missingData.push('ADX/DMI');
  }

  if (finiteNumber(input.bollingerPercentB)) {
    availableMax += 10;
    if (input.bollingerPercentB >= 0.15 && input.bollingerPercentB <= 0.85) {
      points += 10;
      reasons.push(`Posisi Bollinger masih sehat (%B ${input.bollingerPercentB.toFixed(2)}).`);
    } else if (input.bollingerPercentB > 0.85 && input.bollingerPercentB < 1) {
      points += 5;
      caveats.push(`Harga sudah dekat upper Bollinger Band (%B ${input.bollingerPercentB.toFixed(2)}).`);
    } else {
      points += 2;
      caveats.push(`Posisi Bollinger ekstrem (%B ${input.bollingerPercentB.toFixed(2)}).`);
    }
  } else {
    missingData.push('Bollinger %B');
  }

  if (finitePositive(input.volumeRatio)) {
    availableMax += 10;
    if (input.volumeRatio >= 1.5) {
      points += 10;
      reasons.push(`Volume menguat ${input.volumeRatio.toFixed(1)}x rata-rata 20 hari.`);
    } else if (input.volumeRatio >= 1) {
      points += 6;
      reasons.push(`Volume setidaknya sejalan dengan rata-rata 20 hari.`);
    } else {
      points += 2;
      caveats.push('Volume belum mengonfirmasi rencana trade.');
    }
  } else {
    missingData.push('Rasio volume 20 hari');
  }

  if (finiteNumber(input.officialNetPressure20) && finiteNumber(input.officialPositiveRatio20)) {
    availableMax += 15;
    if (input.officialNetPressure20 > 0 && input.officialPositiveRatio20 >= 0.6) {
      points += 15;
      reasons.push(`Foreign flow IDX 20D positif dengan rasio hari beli ${(input.officialPositiveRatio20 * 100).toFixed(0)}%.`);
    } else if (input.officialNetPressure20 > 0) {
      points += 9;
      reasons.push('Foreign flow IDX 20D positif, tetapi persistensinya belum kuat.');
    } else {
      points += 2;
      caveats.push('Foreign flow IDX 20D belum mendukung rencana long.');
    }
  } else {
    missingData.push('Foreign flow IDX resmi 20D');
  }

  const confidenceScore = availableMax > 0 ? roundScore((points / availableMax) * 100) : 0;
  const dataPoints: TradePlanDataPoint[] = [
    dataPoint('structure', 'Support/resistance struktural', 'PRICE_OHLC', setup.supportQuality),
    dataPoint('atr', 'ATR 14', 'PRICE_OHLC', finitePositive(input.atr) ? input.atr : null),
    dataPoint('riskReward', 'Risk/reward', 'PRICE_OHLC', setup.rr),
    dataPoint('adxDmi', 'ADX/DMI', 'PRICE_OHLC', finitePositive(input.adx) && finiteNumber(input.plusDi) && finiteNumber(input.minusDi) ? `${input.adx.toFixed(1)} / ${input.plusDi.toFixed(1)} / ${input.minusDi.toFixed(1)}` : null),
    dataPoint('bollinger', 'Bollinger %B', 'PRICE_OHLC', finiteNumber(input.bollingerPercentB) ? Number(input.bollingerPercentB.toFixed(2)) : null),
    dataPoint('volume', 'Volume ratio 20D', 'VOLUME_OHLC', finitePositive(input.volumeRatio) ? Number(input.volumeRatio.toFixed(2)) : null),
    dataPoint('idxForeignFlow', 'Foreign flow IDX 20D', 'IDX_OFFICIAL_FOREIGN_FLOW', finiteNumber(input.officialNetPressure20) ? input.officialNetPressure20 : null),
  ];

  return {
    version: TRADE_PLAN_VERSION,
    entryReference: TRADE_PLAN_ENTRY_REFERENCE,
    entry: setup.entry,
    stopLoss: setup.stop,
    cutLoss: setup.cl1,
    takeProfit1: setup.tp1,
    takeProfit2: setup.tp2,
    riskReward: setup.rr,
    riskPercent: setup.riskPct,
    riskAtr: setup.riskAtr,
    riskLevel: riskLevel(setup),
    confidenceScore,
    confidenceLevel: confidenceLevel(confidenceScore, missingData),
    support: setup.support,
    nearestSupport: setup.nearestSupport,
    resistance: setup.resistance,
    reasons,
    missingData,
    caveats,
    dataPoints,
    legacySetup: setup,
  };
}
