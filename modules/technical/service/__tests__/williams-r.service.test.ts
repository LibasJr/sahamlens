import { describe, expect, it } from 'vitest';
import { calculateWilliamsR, WILLIAMS_R_PERIOD, type WilliamsRBar } from '../williams-r';

// Bar campuran (naik-turun berselang-seling) - nilai acuan dari implementasi KEDUA yang
// ditulis terpisah, lihat scratchpad/verify-indicators.mjs pada sesi pengembangan fitur ini.
const mixedBars: WilliamsRBar[] = [
  { high: 1018.08, low: 997.92, close: 1008 }, { high: 1012.02, low: 991.98, close: 1002 },
  { high: 1020.1, low: 999.9, close: 1010 }, { high: 1014.04, low: 993.96, close: 1004 },
  { high: 1022.12, low: 1001.88, close: 1012 }, { high: 1016.06, low: 995.94, close: 1006 },
  { high: 1024.14, low: 1003.86, close: 1014 }, { high: 1018.08, low: 997.92, close: 1008 },
  { high: 1026.16, low: 1005.84, close: 1016 }, { high: 1020.1, low: 999.9, close: 1010 },
  { high: 1028.18, low: 1007.82, close: 1018 }, { high: 1022.12, low: 1001.88, close: 1012 },
  { high: 1030.2, low: 1009.8, close: 1020 }, { high: 1024.14, low: 1003.86, close: 1014 },
  { high: 1032.22, low: 1011.78, close: 1022 }, { high: 1026.16, low: 1005.84, close: 1016 },
  { high: 1034.24, low: 1013.76, close: 1024 }, { high: 1028.18, low: 1007.82, close: 1018 },
  { high: 1036.26, low: 1015.74, close: 1026 }, { high: 1030.2, low: 1009.8, close: 1020 },
  { high: 1038.28, low: 1017.72, close: 1028 }, { high: 1032.22, low: 1011.78, close: 1022 },
  { high: 1040.3, low: 1019.7, close: 1030 }, { high: 1034.24, low: 1013.76, close: 1024 },
  { high: 1042.32, low: 1021.68, close: 1032 }, { high: 1036.26, low: 1015.74, close: 1026 },
  { high: 1044.34, low: 1023.66, close: 1034 }, { high: 1038.28, low: 1017.72, close: 1028 },
  { high: 1046.36, low: 1025.64, close: 1036 }, { high: 1040.3, low: 1019.7, close: 1030 },
];

describe('calculateWilliamsR - GOLDEN (nilai acuan dari implementasi independen)', () => {
  it('bar campuran 30 -> %R cocok dengan acuan', () => {
    expect(calculateWilliamsR(mixedBars)).toBeCloseTo(-42.44940321743621, 6);
  });
});

describe('calculateWilliamsR - sifat matematis & guard', () => {
  it('close = highest high window -> %R = 0 (puncak)', () => {
    const bars: WilliamsRBar[] = Array.from({ length: WILLIAMS_R_PERIOD }, (_, i) => ({
      high: 1000 + i, low: 990 + i, close: i === WILLIAMS_R_PERIOD - 1 ? 1000 + i : 995 + i,
    }));
    expect(calculateWilliamsR(bars)).toBeCloseTo(0, 6);
  });

  it('close = lowest low window -> %R = -100 (dasar)', () => {
    const bars: WilliamsRBar[] = Array.from({ length: WILLIAMS_R_PERIOD }, (_, i) => ({
      high: 1010 - i, low: 1000 - i, close: i === WILLIAMS_R_PERIOD - 1 ? 1000 - i : 1005 - i,
    }));
    expect(calculateWilliamsR(bars)).toBeCloseTo(-100, 6);
  });

  it('selalu di rentang [-100, 0] untuk data wajar', () => {
    const value = calculateWilliamsR(mixedBars)!;
    expect(value).toBeGreaterThanOrEqual(-100);
    expect(value).toBeLessThanOrEqual(0);
  });

  it('range High=Low sepanjang window -> -50 (titik tengah), bukan NaN', () => {
    const flat: WilliamsRBar[] = Array.from({ length: WILLIAMS_R_PERIOD }, () => ({ high: 1000, low: 1000, close: 1000 }));
    expect(calculateWilliamsR(flat)).toBe(-50);
  });

  it('bar kurang dari period -> null', () => {
    expect(calculateWilliamsR(mixedBars.slice(0, WILLIAMS_R_PERIOD - 1))).toBeNull();
  });
});
