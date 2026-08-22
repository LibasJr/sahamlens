import { describe, expect, it } from 'vitest';
import { calculateStochastic, type StochasticBar } from '../stochastic';

// Bar sintetis: uptrend stabil (high/low/close naik konstan tiap bar) dan campuran
// (naik-turun berselang-seling, net naik). Nilai acuan dihitung lewat implementasi
// KEDUA yang ditulis terpisah (bukan salinan calculateStochastic), lihat
// scratchpad/verify-indicators.mjs pada sesi pengembangan fitur ini.
const uptrendBars: StochasticBar[] = [
  { high: 1015.05, low: 994.95, close: 1005 }, { high: 1020.1, low: 999.9, close: 1010 },
  { high: 1025.15, low: 1004.85, close: 1015 }, { high: 1030.2, low: 1009.8, close: 1020 },
  { high: 1035.25, low: 1014.75, close: 1025 }, { high: 1040.3, low: 1019.7, close: 1030 },
  { high: 1045.35, low: 1024.65, close: 1035 }, { high: 1050.4, low: 1029.6, close: 1040 },
  { high: 1055.45, low: 1034.55, close: 1045 }, { high: 1060.5, low: 1039.5, close: 1050 },
  { high: 1065.55, low: 1044.45, close: 1055 }, { high: 1070.6, low: 1049.4, close: 1060 },
  { high: 1075.65, low: 1054.35, close: 1065 }, { high: 1080.7, low: 1059.3, close: 1070 },
  { high: 1085.75, low: 1064.25, close: 1075 }, { high: 1090.8, low: 1069.2, close: 1080 },
  { high: 1095.85, low: 1074.15, close: 1085 }, { high: 1100.9, low: 1079.1, close: 1090 },
  { high: 1105.95, low: 1084.05, close: 1095 }, { high: 1111, low: 1089, close: 1100 },
  { high: 1116.05, low: 1093.95, close: 1105 }, { high: 1121.1, low: 1098.9, close: 1110 },
  { high: 1126.15, low: 1103.85, close: 1115 }, { high: 1131.2, low: 1108.8, close: 1120 },
  { high: 1136.25, low: 1113.75, close: 1125 }, { high: 1141.3, low: 1118.7, close: 1130 },
  { high: 1146.35, low: 1123.65, close: 1135 }, { high: 1151.4, low: 1128.6, close: 1140 },
  { high: 1156.45, low: 1133.55, close: 1145 }, { high: 1161.5, low: 1138.5, close: 1150 },
];

describe('calculateStochastic - GOLDEN (nilai acuan dari implementasi independen)', () => {
  it('uptrend stabil 30 bar -> %K/%D mendekati puncak range (dekat 100), acuan k=86.88 d=86.92', () => {
    const result = calculateStochastic(uptrendBars);
    expect(result).not.toBeNull();
    expect(result!.k).toBeCloseTo(86.87682312566824, 6);
    expect(result!.d).toBeCloseTo(86.91916980360453, 6);
  });
});

describe('calculateStochastic - guard & sifat matematis', () => {
  it('bar kurang dari minimum -> null, bukan angka setengah jadi', () => {
    expect(calculateStochastic(uptrendBars.slice(0, 10))).toBeNull();
  });

  it('%K dan %D selalu di rentang [0,100] untuk data wajar', () => {
    const result = calculateStochastic(uptrendBars)!;
    expect(result.k).toBeGreaterThanOrEqual(0);
    expect(result.k).toBeLessThanOrEqual(100);
    expect(result.d).toBeGreaterThanOrEqual(0);
    expect(result.d).toBeLessThanOrEqual(100);
  });

  it('range High=Low sepanjang window (saham tidak bertransaksi) -> %K/%D = 50 (titik tengah), bukan NaN', () => {
    const flatBars: StochasticBar[] = Array.from({ length: 25 }, () => ({ high: 1000, low: 1000, close: 1000 }));
    const result = calculateStochastic(flatBars);
    expect(result).not.toBeNull();
    expect(result!.k).toBe(50);
    expect(result!.d).toBe(50);
  });

  it('harga tepat di Highest High seluruh window -> %K = 100 (puncak range)', () => {
    // 20 bar, bar terakhir close = highest high dari seluruh window.
    const bars: StochasticBar[] = Array.from({ length: 20 }, (_, i) => ({
      high: 1000 + i, low: 990 + i, close: i === 19 ? 1019 : 995 + i,
    }));
    const result = calculateStochastic(bars, 14, 1, 1); // smoothK=1, periodD=1 -> %K mentah langsung
    expect(result!.k).toBeCloseTo(100, 5);
  });
});
