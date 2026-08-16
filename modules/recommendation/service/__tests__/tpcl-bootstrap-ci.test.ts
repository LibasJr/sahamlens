import { describe, expect, it } from 'vitest';
import { bootstrapTpclExpectancyCi95, type TpclTradeObservation } from '../tpcl-validation.service';

function trade(i: number, netReturnPct: number): TpclTradeObservation {
  const week = Math.floor(i / 3);
  const day = (week * 7) + (i % 3) + 1;
  const signalDate = new Date(Date.UTC(2025, 0, day)).toISOString().slice(0, 10);
  return {
    ticker: `T${i}.JK`, signalDate, entryDate: signalDate, exitDate: signalDate, split: 'VALIDATION',
    regime: 'SIDEWAYS', outcome: netReturnPct > 0 ? 'TP1' : 'SL', netReturnPct,
    tp1Hit: netReturnPct > 0, tp2Reached: false, slHit: netReturnPct <= 0,
    maePct: Math.min(netReturnPct, 0), mfePct: Math.max(netReturnPct, 0), daysHeld: 10,
    daysToTp1: netReturnPct > 0 ? 5 : null, daysToSl: netReturnPct <= 0 ? 5 : null,
    riskPct: 2, riskAtr: 1.5, stopSource: 'ATR', ambiguousBar: false,
  };
}

describe('TP/CL expectancy block-bootstrap CI', () => {
  it('deterministik untuk dataset yang sama', () => {
    const rows = Array.from({ length: 60 }, (_, i) => trade(i, 1 + (i % 5) * 0.1));
    const a = bootstrapTpclExpectancyCi95(rows, 500);
    const b = bootstrapTpclExpectancyCi95(rows, 500);
    expect(a).toEqual(b);
    expect(a.iterations).toBe(500);
  });

  it('mendukung klaim positif hanya bila batas bawah CI di atas nol', () => {
    const rows = Array.from({ length: 60 }, (_, i) => trade(i, 1.5 + (i % 4) * 0.2));
    const ci = bootstrapTpclExpectancyCi95(rows, 500);
    expect(ci.lowPct).not.toBeNull();
    expect(ci.lowPct as number).toBeGreaterThan(0);
  });

  it('sampel bercampur yang tidak meyakinkan tetap menyentuh nol', () => {
    const rows = Array.from({ length: 60 }, (_, i) => trade(i, i % 2 === 0 ? 2 : -2));
    const ci = bootstrapTpclExpectancyCi95(rows, 500);
    expect(ci.lowPct).not.toBeNull();
    expect(ci.highPct).not.toBeNull();
    expect(ci.lowPct as number).toBeLessThanOrEqual(0);
    expect(ci.highPct as number).toBeGreaterThanOrEqual(0);
  });

  it('fail-closed bila sample gate belum terpenuhi', () => {
    const rows = Array.from({ length: 29 }, (_, i) => trade(i, 2));
    expect(bootstrapTpclExpectancyCi95(rows, 500)).toEqual({ lowPct: null, highPct: null, iterations: 0 });
  });
});
