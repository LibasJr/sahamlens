import { describe, it, expect } from 'vitest';
import { categorizeSetup, setupCategoryLabel, setupCategoryColor } from '../setup-category';
import type { AiPickItem } from '../radar-model';

function makeItem(overrides: Partial<AiPickItem> = {}): AiPickItem {
  return {
    symbol: 'BBCA.JK',
    price: 10000,
    changePct: 2.5,
    baseScore: 75,
    signals: [],
    finalScore: 75,
    coverage: 95,
    flagged: false,
    flagReason: null,
    breakdown: { technical: 30, fundamental: 25, flow: 20 },
    topReasons: ['MACD bullish'],
    ...overrides,
  };
}

describe('categorizeSetup', () => {
  it('returns Breakout when signal includes breakout', () => {
    const item = makeItem({ signals: ['breakout'] });
    expect(categorizeSetup(item)).toBe('Breakout');
  });

  it('returns Retest when near support and has tradePlan', () => {
    const item = makeItem({
      price: 10200,
      signals: [],
      tradePlan: {
        version: 'TRADE_PLAN_V1_0',
        entryReference: 'OPEN_H_PLUS_1',
        entry: 10200,
        stopLoss: 9800,
        cutLoss: 9800,
        takeProfit1: 10800,
        takeProfit2: 11200,
        riskReward: 2.0,
        riskPercent: 3.9,
        riskAtr: 1.2,
        riskLevel: 'LOW',
        confidenceScore: 80,
        confidenceLevel: 'HIGH',
        support: { price: 10000, touches: 3 },
        nearestSupport: { price: 10000, touches: 3 },
        resistance: { price: 11000, touches: 2 },
        reasons: ['Pullback ke support'],
        missingData: [],
        caveats: [],
      },
    });
    // price 10200, support 10000 → 2% away → within 2.5% threshold
    expect(categorizeSetup(item)).toBe('Retest');
  });

  it('does NOT return Retest when far from support (>2.5%)', () => {
    const item = makeItem({
      price: 11000,
      signals: [],
      tradePlan: {
        version: 'TRADE_PLAN_V1_0',
        entryReference: 'OPEN_H_PLUS_1',
        entry: 11000,
        stopLoss: 10500,
        cutLoss: 10500,
        takeProfit1: 11600,
        takeProfit2: 12000,
        riskReward: 2.0,
        riskPercent: 4.5,
        riskAtr: 1.5,
        riskLevel: 'MEDIUM',
        confidenceScore: 70,
        confidenceLevel: 'MEDIUM',
        support: { price: 10000, touches: 2 },
        nearestSupport: { price: 10000, touches: 2 },
        resistance: { price: 11500, touches: 1 },
        reasons: ['Uptrend continuation'],
        missingData: [],
        caveats: [],
      },
    });
    // price 11000, support 10000 → 10% away → NOT near support
    expect(categorizeSetup(item)).toBe('Momentum continuation');
  });

  it('returns Momentum continuation when golden cross present', () => {
    const item = makeItem({ signals: ['golden cross'] });
    expect(categorizeSetup(item)).toBe('Momentum continuation');
  });

  it('returns Momentum continuation when has tradePlan, not near support, and price rising', () => {
    const item = makeItem({
      changePct: 3.0,
      price: 10500,
      signals: [],
      tradePlan: {
        version: 'TRADE_PLAN_V1_0',
        entryReference: 'OPEN_H_PLUS_1',
        entry: 10500,
        stopLoss: 10000,
        cutLoss: 10000,
        takeProfit1: 11100,
        takeProfit2: 11500,
        riskReward: 1.8,
        riskPercent: 4.8,
        riskAtr: 1.6,
        riskLevel: 'MEDIUM',
        confidenceScore: 65,
        confidenceLevel: 'MEDIUM',
        support: { price: 9500, touches: 2 },
        nearestSupport: { price: 9500, touches: 2 },
        resistance: { price: 11000, touches: 3 },
        reasons: ['Strong momentum'],
        missingData: [],
        caveats: [],
      },
    });
    expect(categorizeSetup(item)).toBe('Momentum continuation');
  });

  it('returns Reversal when accumulation + near support + has tradePlan', () => {
    const item = makeItem({
      price: 10100,
      changePct: -0.5,
      signals: ['akumulasi'],
      tradePlan: {
        version: 'TRADE_PLAN_V1_0',
        entryReference: 'OPEN_H_PLUS_1',
        entry: 10100,
        stopLoss: 9700,
        cutLoss: 9700,
        takeProfit1: 10700,
        takeProfit2: 11000,
        riskReward: 1.7,
        riskPercent: 4.0,
        riskAtr: 1.3,
        riskLevel: 'MEDIUM',
        confidenceScore: 60,
        confidenceLevel: 'MEDIUM',
        support: { price: 10000, touches: 4 },
        nearestSupport: { price: 10000, touches: 4 },
        resistance: { price: 10800, touches: 2 },
        reasons: ['Accumulation near support'],
        missingData: [],
        caveats: [],
      },
    });
    expect(categorizeSetup(item)).toBe('Reversal');
  });

  it('returns Setup teknikal as fallback when no signals and no tradePlan', () => {
    const item = makeItem({ signals: [], tradePlan: null });
    expect(categorizeSetup(item)).toBe('Setup teknikal');
  });

  it('returns Setup teknikal when signals exist but no tradePlan and no breakout', () => {
    const item = makeItem({ signals: ['golden cross'], tradePlan: null });
    // golden cross → Momentum continuation (no tradePlan needed)
    expect(categorizeSetup(item)).toBe('Momentum continuation');
  });

  it('returns Setup teknikal for accumulation without tradePlan', () => {
    const item = makeItem({ signals: ['akumulasi'], tradePlan: null });
    expect(categorizeSetup(item)).toBe('Setup teknikal');
  });

  it('breakout takes priority over all other signals', () => {
    const item = makeItem({
      signals: ['breakout', 'golden cross', 'akumulasi'],
    });
    expect(categorizeSetup(item)).toBe('Breakout');
  });

  it('Reversal takes priority over Retest (accumulation + near support)', () => {
    const item = makeItem({
      price: 10100,
      changePct: -0.5,
      signals: ['akumulasi'],
      tradePlan: {
        version: 'TRADE_PLAN_V1_0',
        entryReference: 'OPEN_H_PLUS_1',
        entry: 10100,
        stopLoss: 9700,
        cutLoss: 9700,
        takeProfit1: 10700,
        takeProfit2: 11000,
        riskReward: 1.7,
        riskPercent: 4.0,
        riskAtr: 1.3,
        riskLevel: 'MEDIUM',
        confidenceScore: 60,
        confidenceLevel: 'MEDIUM',
        support: { price: 10000, touches: 4 },
        nearestSupport: { price: 10000, touches: 4 },
        resistance: { price: 10800, touches: 2 },
        reasons: ['Accumulation near support'],
        missingData: [],
        caveats: [],
      },
    });
    expect(categorizeSetup(item)).toBe('Reversal');
  });

  it('Retest takes priority over Momentum continuation', () => {
    const item = makeItem({
      price: 10100,
      changePct: 1.0,
      signals: ['golden cross'],
      tradePlan: {
        version: 'TRADE_PLAN_V1_0',
        entryReference: 'OPEN_H_PLUS_1',
        entry: 10100,
        stopLoss: 9700,
        cutLoss: 9700,
        takeProfit1: 10700,
        takeProfit2: 11000,
        riskReward: 1.7,
        riskPercent: 4.0,
        riskAtr: 1.3,
        riskLevel: 'MEDIUM',
        confidenceScore: 60,
        confidenceLevel: 'MEDIUM',
        support: { price: 10000, touches: 3 },
        nearestSupport: { price: 10000, touches: 3 },
        resistance: { price: 10800, touches: 2 },
        reasons: [],
        missingData: [],
        caveats: [],
      },
    });
    expect(categorizeSetup(item)).toBe('Retest');
  });
});

describe('setupCategoryLabel', () => {
  it('returns Indonesian labels when isId=true', () => {
    expect(setupCategoryLabel('Breakout', true)).toBe('Breakout');
    expect(setupCategoryLabel('Retest', true)).toBe('Retest');
    expect(setupCategoryLabel('Momentum continuation', true)).toBe('Lanjutan Momentum');
    expect(setupCategoryLabel('Reversal', true)).toBe('Reversal');
    expect(setupCategoryLabel('Setup teknikal', true)).toBe('Setup Teknikal');
  });

  it('returns English labels when isId=false', () => {
    expect(setupCategoryLabel('Breakout', false)).toBe('Breakout');
    expect(setupCategoryLabel('Retest', false)).toBe('Retest');
    expect(setupCategoryLabel('Momentum continuation', false)).toBe('Momentum Continuation');
    expect(setupCategoryLabel('Reversal', false)).toBe('Reversal');
    expect(setupCategoryLabel('Setup teknikal', false)).toBe('Technical Setup');
  });
});

describe('setupCategoryColor', () => {
  it('returns non-empty color classes for all categories', () => {
    const categories = ['Breakout', 'Retest', 'Momentum continuation', 'Reversal', 'Setup teknikal'] as const;
    for (const cat of categories) {
      const color = setupCategoryColor(cat);
      expect(color).toBeTruthy();
      expect(color).toContain('text-tv-');
    }
  });

  it('returns distinct colors per category', () => {
    const colors = new Set([
      setupCategoryColor('Breakout'),
      setupCategoryColor('Retest'),
      setupCategoryColor('Momentum continuation'),
      setupCategoryColor('Reversal'),
      setupCategoryColor('Setup teknikal'),
    ]);
    expect(colors.size).toBe(5);
  });
});
