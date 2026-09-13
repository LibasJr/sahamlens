import { describe, expect, it } from 'vitest';
import { buildGuestTechnicalSnapshot } from './GuestTechnicalPreview';

function candles(closes: number[]) {
  return closes.map((close, index) => ({
    close,
    time: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
  }));
}

describe('buildGuestTechnicalSnapshot', () => {
  it('builds a real guest preview from public closes', () => {
    const snapshot = buildGuestTechnicalSnapshot(candles(Array.from({ length: 60 }, (_, index) => 100 + index)));

    expect(snapshot).not.toBeNull();
    expect(snapshot?.price).toBe(159);
    expect(snapshot?.changePct).toBeCloseTo((1 / 158) * 100, 8);
    expect(snapshot?.ema20).not.toBeNull();
    expect(snapshot?.ema50).not.toBeNull();
    expect(snapshot?.rsi14).toBe(100);
    expect(snapshot?.trend).toBe('Bullish');
    expect(snapshot?.closes).toHaveLength(60);
  });

  it('does not fabricate a preview without enough valid prices', () => {
    expect(buildGuestTechnicalSnapshot([{ close: 0 }, { close: Number.NaN }])).toBeNull();
  });
});
