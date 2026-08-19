import { describe, expect, it } from 'vitest';
import {
  buildBandarFlowModel,
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
});
