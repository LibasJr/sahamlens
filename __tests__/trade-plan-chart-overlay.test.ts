import { describe, expect, it } from 'vitest';
import { buildTradePlanPriceLines } from '@/components/TradingViewChart';
import type { TradePlanV1 } from '@/modules/recommendation/service/trade-plan';

describe('TradingViewChart trade plan price lines overlay', () => {
  it('returns empty array when trade plan is null or undefined', () => {
    expect(buildTradePlanPriceLines(null)).toEqual([]);
    expect(buildTradePlanPriceLines(undefined)).toEqual([]);
  });

  it('builds entry, SL, TP1, and TP2 price lines with correct styles and colors', () => {
    const tradePlan = {
      version: 'TRADE_PLAN_V1_0',
      entryReference: 'OPEN_H_PLUS_1',
      entry: 1050,
      stopLoss: 990,
      cutLoss: 990,
      takeProfit1: 1150,
      takeProfit2: 1250,
      riskReward: 2.1,
      riskPercent: 5.7,
      riskAtr: 1.2,
      riskLevel: 'LOW',
      confidenceScore: 85,
      confidenceLevel: 'HIGH',
      support: null,
      nearestSupport: null,
      resistance: null,
      reasons: [],
      missingData: [],
      caveats: [],
      dataPoints: [],
      legacySetup: {} as any,
    } as TradePlanV1;

    const lines = buildTradePlanPriceLines(tradePlan);
    expect(lines).toHaveLength(4);

    // Entry
    expect(lines[0]).toEqual({
      price: 1050,
      color: '#2962ff',
      lineWidth: 2,
      axisLabelVisible: true,
      title: 'Entry 1.050',
    });

    // Stop Loss
    expect(lines[1]).toEqual({
      price: 990,
      color: '#f23645',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'SL 990',
    });

    // Take Profit 1
    expect(lines[2]).toEqual({
      price: 1150,
      color: '#089981',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'TP1 1.150',
    });

    // Take Profit 2
    expect(lines[3]).toEqual({
      price: 1250,
      color: '#089981',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'TP2 1.250',
    });
  });

  it('omits TP2 when takeProfit2 is undefined or null', () => {
    const tradePlan = {
      version: 'TRADE_PLAN_V1_0',
      entryReference: 'OPEN_H_PLUS_1',
      entry: 500,
      stopLoss: 470,
      cutLoss: 470,
      takeProfit1: 560,
      riskReward: 2.0,
      riskPercent: 6.0,
      riskAtr: 1.0,
      riskLevel: 'LOW',
      confidenceScore: 80,
      confidenceLevel: 'HIGH',
      support: null,
      nearestSupport: null,
      resistance: null,
      reasons: [],
      missingData: [],
      caveats: [],
      dataPoints: [],
      legacySetup: {} as any,
    } as unknown as TradePlanV1;

    const lines = buildTradePlanPriceLines(tradePlan);
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.title)).toEqual(['Entry 500', 'SL 470', 'TP1 560']);
  });

  it('ignores invalid non-positive or non-finite values', () => {
    const invalidPlan = {
      entry: 0,
      stopLoss: -10,
      takeProfit1: Number.NaN,
      takeProfit2: Infinity,
    } as unknown as TradePlanV1;

    expect(buildTradePlanPriceLines(invalidPlan)).toEqual([]);
  });
});
