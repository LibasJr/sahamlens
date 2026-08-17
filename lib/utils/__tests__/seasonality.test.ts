import { describe, expect, it } from 'vitest';
import { calculateMonthlySeasonality } from '../seasonality';

describe('calculateMonthlySeasonality', () => {
  it('menangani input kosong dengan aman', () => {
    const res = calculateMonthlySeasonality([]);
    expect(res.matrix).toEqual([]);
    expect(res.bestMonth).toBeNull();
  });

  it('menghitung return bulanan, rata-rata, dan win rate dengan akurat', () => {
    // 2 tahun data sintetis (2024 dan 2025)
    const candles = [
      // 2024
      { date: '2024-01-02', close: 1000 },
      { date: '2024-01-31', close: 1100 }, // Jan 2024: +10%
      { date: '2024-02-28', close: 1045 }, // Feb 2024: -5%
      { date: '2024-12-30', close: 1200 }, // Dec 2024
      // 2025
      { date: '2025-01-02', close: 1200 },
      { date: '2025-01-31', close: 1320 }, // Jan 2025: +10%
      { date: '2025-02-28', close: 1386 }, // Feb 2025: +5%
    ];

    const result = calculateMonthlySeasonality(candles);

    expect(result.matrix.length).toBe(2);
    // Tahun terbaru (2025) di urutan pertama
    expect(result.matrix[0].year).toBe(2025);
    expect(result.matrix[1].year).toBe(2024);

    // Jan average return: (10 + 10) / 2 = 10%
    expect(result.monthAverages[0]).toBe(10);
    // Jan win rate: 100%
    expect(result.monthWinRates[0]).toBe(100);

    // Feb win rate: 1 win out of 2 = 50%
    expect(result.monthWinRates[1]).toBe(50);
    // Feb avg return: (-5 + 5) / 2 = 0%
    expect(result.monthAverages[1]).toBe(0);
  });
});
