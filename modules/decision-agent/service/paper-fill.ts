import { roundToIdxTick } from '@/modules/recommendation/service/trading-setup';
import type { PaperOrderSide } from '../types/decision-agent.types';

export interface PaperFillCalculation {
  fillPrice: number;
  grossValue: number;
  feeValue: number;
  cashDelta: number;
}

export function calculatePaperFill(input: {
  side: PaperOrderSide;
  quotePrice: number;
  lots: number;
  slippageBps: number;
  feePct: number;
}): PaperFillCalculation | null {
  if (
    !Number.isFinite(input.quotePrice) || input.quotePrice <= 0 ||
    !Number.isInteger(input.lots) || input.lots <= 0 ||
    !Number.isFinite(input.slippageBps) || input.slippageBps < 0 ||
    !Number.isFinite(input.feePct) || input.feePct < 0
  ) return null;

  const adverseMultiplier = input.side === 'BUY'
    ? 1 + input.slippageBps / 10_000
    : 1 - input.slippageBps / 10_000;
  const fillPrice = roundToIdxTick(
    input.quotePrice * adverseMultiplier,
    input.side === 'BUY' ? 'up' : 'down',
  );
  if (!Number.isFinite(fillPrice) || fillPrice <= 0) return null;
  const grossValue = fillPrice * input.lots * 100;
  const feeValue = grossValue * input.feePct / 100;
  return {
    fillPrice,
    grossValue,
    feeValue,
    cashDelta: input.side === 'BUY' ? -(grossValue + feeValue) : grossValue - feeValue,
  };
}
