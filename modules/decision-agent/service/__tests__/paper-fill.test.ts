import { describe, expect, it } from 'vitest';
import { calculatePaperFill } from '../paper-fill';

describe('calculatePaperFill', () => {
  it('menerapkan slippage merugikan dan fee aktual pada BUY', () => {
    const result = calculatePaperFill({ side: 'BUY', quotePrice: 1_000, lots: 10, slippageBps: 10, feePct: 0.15 });
    expect(result).toEqual({ fillPrice: 1_005, grossValue: 1_005_000, feeValue: 1_507.5, cashDelta: -1_006_507.5 });
  });

  it('menerapkan slippage merugikan dan fee aktual pada SELL', () => {
    const result = calculatePaperFill({ side: 'SELL', quotePrice: 1_000, lots: 10, slippageBps: 10, feePct: 0.25 });
    expect(result).toEqual({ fillPrice: 995, grossValue: 995_000, feeValue: 2_487.5, cashDelta: 992_512.5 });
  });

  it('fail-closed untuk input tidak valid', () => {
    expect(calculatePaperFill({ side: 'BUY', quotePrice: 0, lots: 1, slippageBps: 0, feePct: 0 })).toBeNull();
  });
});
