import { describe, expect, it } from 'vitest';

import {
  distanceFromHighPct,
  maxDailyReturnPct,
  percentileRanks,
  stdevOfLogReturnsPct,
  volatilityPct,
} from '../service/risk-profile.service';

/**
 * Uji aritmetika. Deret di sini adalah bilangan yang dibuat khusus untuk menguji rumus
 * (bukan data pasar), karena yang diuji adalah apakah rumusnya berhitung benar:
 *  - deret datar → volatilitas 0
 *  - deret naik-turun tetap → volatilitas > 0 dan dapat dihitung tangan
 *  - harga tepat di puncak → jarak 0%; di bawah puncak → negatif
 */
describe('aritmetika profil risiko', () => {
  it('menghitung volatilitas nol untuk deret penutupan yang datar', () => {
    const flat = [100, 100, 100, 100, 100, 100];
    expect(stdevOfLogReturnsPct(flat)).toBe(0);
    expect(volatilityPct(flat, 5)).toBe(0);
  });

  it('menghitung volatilitas dari imbal hasil penutupan-ke-penutupan', () => {
    // 100 → 110 → 99 → 108,9 → 98,01 : log return bergantian +0,0953 dan -0,1054.
    const closes = [100, 110, 99, 108.9, 98.01];
    const value = volatilityPct(closes, 4);
    expect(value).not.toBeNull();
    const expected = (() => {
      const returns = [
        Math.log(110 / 100),
        Math.log(99 / 110),
        Math.log(108.9 / 99),
        Math.log(98.01 / 108.9),
      ];
      const average = returns.reduce((total, item) => total + item, 0) / returns.length;
      const variance = returns.reduce((total, item) => total + (item - average) ** 2, 0) / (returns.length - 1);
      return Math.sqrt(variance) * 100;
    })();
    expect(value as number).toBeCloseTo(expected, 10);
    expect(value as number).toBeGreaterThan(0);
  });

  it('menolak deret yang terlalu pendek alih-alih mengira-ngira', () => {
    expect(stdevOfLogReturnsPct([100])).toBeNull();
    expect(stdevOfLogReturnsPct([100, 101])).toBeNull();
    expect(volatilityPct([100, 101, 102], 10)).toBeNull();
    expect(distanceFromHighPct([100, 101, 102], 252)).toBeNull();
    expect(maxDailyReturnPct([100, 101, 102], 20)).toBeNull();
  });

  it('mengukur jarak dari puncak jendela: 0% di puncak, negatif di bawahnya', () => {
    const closes = [50, 80, 120, 90, 60];
    expect(distanceFromHighPct(closes, 5)).toBeCloseTo((60 / 120 - 1) * 100, 10);
    expect(distanceFromHighPct([50, 80, 120, 90, 120], 5)).toBeCloseTo(0, 10);
    expect(distanceFromHighPct(closes, 5) as number).toBeLessThan(0);
  });

  it('mengambil puncak imbal hasil harian, bukan puncak harga', () => {
    const closes = [100, 120, 100, 100];
    const value = maxDailyReturnPct(closes, 3);
    expect(value).toBeCloseTo(Math.log(120 / 100) * 100, 10);
  });

  it('memberi persentil 100 untuk yang terbaik menurut arah ciri', () => {
    const values = [1, 2, 3, 4];
    // volatile: yang terkecil (1) harus dapat persentil tertinggi
    const volatileRanks = percentileRanks(values, false);
    volatileRanks.forEach((rank, index) => {
      expect(rank).toBeCloseTo([100, 66.66666666666666, 33.33333333333333, 0][index], 8);
    });
    // makin besar makin baik: yang terbesar (4) dapat persentil tertinggi
    const betterRanks = percentileRanks(values, true);
    betterRanks.forEach((rank, index) => {
      expect(rank).toBeCloseTo([0, 33.33333333333333, 66.66666666666666, 100][index], 8);
    });
  });

  it('memakai peringkat rata-rata saat nilai seri, agar tidak ada urutan yang dikarang', () => {
    const ranks = percentileRanks([5, 5, 5], true);
    expect(ranks[0]).toBe(ranks[1]);
    expect(ranks[1]).toBe(ranks[2]);
  });
});