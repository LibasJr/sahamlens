import { describe, expect, it } from 'vitest';
import {
  buildBandarFlowModel,
  buildHeatDots,
  finiteNumber,
  formatFlowBillion,
} from '../bandar-flow-model';

describe('bandar flow presentation model', () => {
  it('fails closed for non-finite values', () => {
    expect(finiteNumber(Number.NaN)).toBeNull();
    expect(finiteNumber(Infinity)).toBeNull();
    expect(formatFlowBillion(undefined)).toBe('N/A');
  });

  it('defaults the active bar to the latest available session', () => {
    const model = buildBandarFlowModel(
      [
        { date: '2026-08-17', close: 100, netValueBillion: -2 },
        { date: '2026-08-18', close: 105, netValueBillion: 3 },
      ],
      { status: 'AKUMULASI' },
      null,
    );
    expect(model.activeIdx).toBe(1);
    expect(model.activeBarValue).toBe(3);
  });

  it('classifies a three-day streak as strong without inventing a trade signal', () => {
    const model = buildBandarFlowModel([], { status: 'AKUMULASI', accumulationStreak: 3 }, null);
    expect(model.isStrong).toBe(true);
    expect(model.flowTier).toBe('STRONG ACCUMULATION');
    expect(model.borderAccent).toBe('border-l-tv-green');
  });

  it('computes foreign buy composition only when total volume is positive', () => {
    const normal = buildBandarFlowModel([], { foreignBuyVolume: 70, foreignSellVolume: 30 }, null);
    expect(normal.buyPct).toBe(70);

    const missing = buildBandarFlowModel([], { foreignBuyVolume: null, foreignSellVolume: null }, null);
    expect(missing.buyPct).toBeNull();
  });

  it('maps flat close series to the center line and never divides by zero', () => {
    const model = buildBandarFlowModel(
      [{ close: 100 }, { close: 100 }],
      {},
      null,
    );
    expect(model.pricePoints).toBe('0.00,50.00 100.00,50.00');
  });

  it('evaluates tug-of-war dominance metrics correctly', () => {
    const accumulation = buildBandarFlowModel([], { foreignBuyVolume: 65, foreignSellVolume: 35 }, null);
    expect(accumulation.buyPct).toBe(65);
    expect(accumulation.sellPct).toBe(35);
    expect(accumulation.isAccumulationDominant).toBe(true);
    expect(accumulation.isDistributionDominant).toBe(false);

    const distribution = buildBandarFlowModel([], { foreignBuyVolume: 30, foreignSellVolume: 70 }, null);
    expect(distribution.buyPct).toBe(30);
    expect(distribution.sellPct).toBe(70);
    expect(distribution.isAccumulationDominant).toBe(false);
    expect(distribution.isDistributionDominant).toBe(true);

    const balanced = buildBandarFlowModel([], { foreignBuyVolume: 50, foreignSellVolume: 50 }, null);
    expect(balanced.buyPct).toBe(50);
    expect(balanced.sellPct).toBe(50);
    expect(balanced.isBalanced).toBe(true);
  });

  it('builds heat dots with correct classification and volume-weighted opacity', () => {
    const flow = [
      { date: '2026-08-01', netValueBillion: 10 },
      { date: '2026-08-02', netValueBillion: -5 },
      { date: '2026-08-03', netValueBillion: 0 },
    ];
    const maxAbsFlow = 10;
    const dots = buildHeatDots(flow, maxAbsFlow);

    expect(dots).toHaveLength(3);

    // Net Buy (10M / max 10M -> opacity 1.0)
    expect(dots[0].date).toBe('2026-08-01');
    expect(dots[0].nominalBillion).toBe(10);
    expect(dots[0].isNetBuy).toBe(true);
    expect(dots[0].isNetSell).toBe(false);
    expect(dots[0].isFlat).toBe(false);
    expect(dots[0].opacity).toBe(1);
    expect(dots[0].opacityClass).toBe('opacity-100');

    // Net Sell (-5M / max 10M -> ratio 0.5 -> opacity 0.3 + 0.7*0.5 = 0.65)
    expect(dots[1].date).toBe('2026-08-02');
    expect(dots[1].nominalBillion).toBe(-5);
    expect(dots[1].isNetBuy).toBe(false);
    expect(dots[1].isNetSell).toBe(true);
    expect(dots[1].isFlat).toBe(false);
    expect(dots[1].opacity).toBeCloseTo(0.65, 2);
    expect(dots[1].opacityClass).toBe('opacity-75');

    // Flat (0M)
    expect(dots[2].date).toBe('2026-08-03');
    expect(dots[2].nominalBillion).toBe(0);
    expect(dots[2].isNetBuy).toBe(false);
    expect(dots[2].isNetSell).toBe(false);
    expect(dots[2].isFlat).toBe(true);
    expect(dots[2].opacity).toBe(0.35);
    expect(dots[2].opacityClass).toBe('opacity-30');
  });
});
