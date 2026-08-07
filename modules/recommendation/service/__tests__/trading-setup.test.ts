import { describe, expect, it } from 'vitest';
import {
  buildLongTradingSetup,
  MIN_CONFIRMED_LEVEL_TOUCHES,
  roundToIdxTick,
} from '../trading-setup';

const baseHistory = (resistanceHigh = 130) => [
  { High: 102, Low: 101, Close: 101 },
  { High: 103, Low: 101, Close: 102 },
  { High: 104, Low: 102, Close: 103 },
  { High: 103, Low: 101, Close: 102 },
  { High: 102, Low: 101, Close: 101 },
  { High: 104, Low: 102, Close: 103 },
  { High: 105, Low: 100, Close: 102 },
  { High: 106, Low: 102, Close: 104 },
  { High: 108, Low: 104, Close: 106 },
  { High: 112, Low: 106, Close: 110 },
  { High: 120, Low: 110, Close: 118 },
  { High: resistanceHigh, Low: 115, Close: 120 },
  { High: resistanceHigh - 2, Low: 112, Close: 116 },
  { High: 118, Low: 108, Close: 112 },
  { High: 112, Low: 104, Close: 108 },
  { High: 110, Low: 103, Close: 106 },
  { High: 109, Low: 103, Close: 106 },
  { High: 110, Low: 104, Close: 107 },
  { High: 111, Low: 105, Close: 108 },
  { High: 112, Low: 105, Close: 106 },
];

describe('buildLongTradingSetup', () => {
  it('menjaga minimal level confirmation eksplisit', () => {
    expect(MIN_CONFIRMED_LEVEL_TOUCHES).toBe(2);
  });

  it('menghasilkan TP/CL executable dengan RR minimal dan metrik risiko', () => {
    const setup = buildLongTradingSetup(baseHistory(), 106, 5);

    expect(setup).not.toBeNull();
    if (!setup) throw new Error('setup null');

    expect(setup.cl1).toBe(setup.stop);
    expect(setup.rr).toBeGreaterThanOrEqual(1.5);
    expect(setup.riskPct).toBeGreaterThan(0);
    expect(setup.riskAtr).toBeGreaterThan(0);
    expect(setup.emergencyRiskLevel).toBe(setup.cl2);
  });

  it('tidak memakai support satu-sentuhan sebagai stop struktural', () => {
    const setup = buildLongTradingSetup(baseHistory(), 106, 5);

    expect(setup).not.toBeNull();
    if (!setup) throw new Error('setup null');

    if (setup.nearestSupport && setup.nearestSupport.touches < MIN_CONFIRMED_LEVEL_TOUCHES) {
      expect(setup.support).toBeNull();
      expect(setup.supportQuality).toBe('WEAK');
      expect(setup.stopSource).toBe('ATR');
    }
  });

  it('fail-closed kalau resistance terdekat membuat RR kurang dari 1.5', () => {
    const setup = buildLongTradingSetup(baseHistory(), 116, 5);
    expect(setup).toBeNull();
  });

  it('mengembalikan null kalau ATR tidak tersedia', () => {
    expect(buildLongTradingSetup(baseHistory(), 106, null)).toBeNull();
  });

  it('membulatkan level order ke fraksi harga IDX dan menghitung ulang RR dari level executable', () => {
    expect(roundToIdxTick(4237, 'down')).toBe(4230);
    expect(roundToIdxTick(4237, 'up')).toBe(4240);
    expect(roundToIdxTick(151, 'nearest')).toBe(151);
    expect(roundToIdxTick(5101, 'nearest')).toBe(5100);

    const setup = buildLongTradingSetup(baseHistory(4100), 4237, 80);
    expect(setup).not.toBeNull();
    if (!setup) throw new Error('setup null');

    expect(setup.entry % 10).toBe(0);
    expect(setup.cl1 % 10).toBe(0);
    expect(setup.tp1 % 10).toBe(0);
    expect(setup.rr).toBeGreaterThanOrEqual(1.5);
  });
});
