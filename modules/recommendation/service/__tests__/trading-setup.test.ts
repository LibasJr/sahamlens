import { describe, expect, it } from 'vitest';
import { buildLongTradingSetup } from '../trading-setup';

const baseHistory = (resistanceHigh = 130) => [
  { High: 102, Low: 101, Close: 101 },
  { High: 103, Low: 101, Close: 102 },
  { High: 104, Low: 102, Close: 103 },
  { High: 103, Low: 101, Close: 102 },
  { High: 102, Low: 101, Close: 101 },
  { High: 104, Low: 102, Close: 103 },
  { High: 105, Low: 100, Close: 102 }, // swing low/support
  { High: 106, Low: 102, Close: 104 },
  { High: 108, Low: 104, Close: 106 },
  { High: 112, Low: 106, Close: 110 },
  { High: 120, Low: 110, Close: 118 },
  { High: resistanceHigh, Low: 115, Close: 120 }, // swing high/resistance
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
  it('membuat TP/CL asimetris dari support swing + ATR dengan RR minimal', () => {
    const setup = buildLongTradingSetup(baseHistory(), 106, 5);

    expect(setup).not.toBeNull();
    expect(setup?.cl1).toBe(102);
    expect(setup?.tp1).toBe(114);
    expect(setup?.rr).toBe(2);
    expect(setup?.stopSource).toBe('STRUCTURE_ATR');
  });

  it('fail-closed kalau resistance terdekat membuat RR kurang dari 1.5', () => {
    const setup = buildLongTradingSetup(baseHistory(), 116, 5);

    expect(setup).toBeNull();
  });

  it('mengembalikan null kalau ATR tidak tersedia', () => {
    expect(buildLongTradingSetup(baseHistory(), 106, null)).toBeNull();
  });
});
