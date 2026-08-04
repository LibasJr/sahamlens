import { describe, it, expect } from 'vitest';
import { momentumScore, riskScore } from '../lens-score-breakdown';

const momentumEntry = (decision: string, confidence: number) => [
  { label: 'Momentum 1D/5D', decision, confidence },
];

describe('momentumScore', () => {
  it('returns confidence directly when bullish', () => {
    expect(momentumScore(momentumEntry('BULLISH', 80))).toBe(80);
  });

  it('inverts confidence when bearish', () => {
    expect(momentumScore(momentumEntry('BEARISH', 80))).toBe(20);
  });

  it('returns 50 when neutral', () => {
    expect(momentumScore(momentumEntry('NEUTRAL', 50))).toBe(50);
  });

  it('returns null when the momentum analyzer entry is missing', () => {
    expect(momentumScore([{ label: 'RSI (14)', decision: 'BULLISH', confidence: 70 }])).toBeNull();
  });
});

describe('riskScore', () => {
  it('gives a high score for low volatility (~1.5% ATR)', () => {
    const analyzers = [{ label: 'Volatility (ATR 14)', decision: 'NEUTRAL', confidence: 72, raw: { atr: 15 } }];
    expect(riskScore(analyzers, 1000)).toBe(Math.round(100 - 1.5 * 15));
  });

  it('gives a lower score for high volatility (~3% ATR)', () => {
    const analyzers = [{ label: 'Volatility (ATR 14)', decision: 'NEUTRAL', confidence: 85, raw: { atr: 30 } }];
    expect(riskScore(analyzers, 1000)).toBe(Math.round(100 - 3 * 15));
  });

  it('clamps to 0 for extreme volatility', () => {
    const analyzers = [{ label: 'Volatility (ATR 14)', decision: 'NEUTRAL', confidence: 90, raw: { atr: 200 } }];
    expect(riskScore(analyzers, 1000)).toBe(0);
  });

  it('returns null when the volatility analyzer entry or its raw.atr is missing', () => {
    expect(riskScore([{ label: 'RSI (14)', decision: 'BULLISH', confidence: 70 }], 1000)).toBeNull();
    expect(riskScore([{ label: 'Volatility (ATR 14)', decision: 'NEUTRAL', confidence: 50, raw: { atr: null } }], 1000)).toBeNull();
  });

  it('returns null when currentPrice is not a positive number', () => {
    const analyzers = [{ label: 'Volatility (ATR 14)', decision: 'NEUTRAL', confidence: 72, raw: { atr: 15 } }];
    expect(riskScore(analyzers, 0)).toBeNull();
  });
});
