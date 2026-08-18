import { describe, expect, it } from 'vitest';
import { calculateMonthlySeasonality, type SeasonalityCandle } from '../seasonality';

/**
 * Temuan H-03, M-05, M-06 (audit kuantitatif 2026-08-19).
 *
 * Bar dibuat pada 03:00Z, kira-kira jam pembukaan bursa IDX dalam UTC, supaya uji zona
 * waktu di bawah menguji hal yang sesungguhnya terjadi di produksi.
 */
function bar(time: string, adjClose: number | null, close = 1000): SeasonalityCandle {
  return { time: `${time}T03:00:00Z`, close, adjClose };
}

describe('basis harga (H-03)', () => {
  it('menghitung return dari adjClose, BUKAN dari close', () => {
    // close sengaja dibuat turun sementara adjClose naik - persis bentuk bulan ex-dividen.
    const candles = [
      bar('2025-01-31', 1000, 1000),
      bar('2025-02-28', 1100, 900),
    ];
    const result = calculateMonthlySeasonality(candles);
    expect(result.basis).toBe('TOTAL_RETURN_ADJUSTED');
    // +10% dari adjClose. Kalau `close` yang dipakai hasilnya -10%.
    expect(result.matrix.find((r) => r.year === 2025)?.months[1]).toBeCloseTo(10, 2);
  });

  it('tanpa adjClose TIDAK jatuh balik ke close - fail closed dengan alasan', () => {
    const candles = [bar('2025-01-31', null, 1000), bar('2025-02-28', null, 900)];
    const result = calculateMonthlySeasonality(candles);
    expect(result.basis).toBe('UNAVAILABLE');
    expect(result.matrix).toEqual([]);
    expect(result.unavailableReason).toBeTruthy();
  });

  it('bulan ex-dividen tidak lagi tercatat sebagai bulan rugi', () => {
    // Harga jatuh 5% di hari ex-date, tetapi total return-nya datar.
    const candles = [
      bar('2025-05-30', 2000, 2000),
      bar('2025-06-30', 2000, 1900),
    ];
    const juni = calculateMonthlySeasonality(candles).matrix.find((r) => r.year === 2025)?.months[5];
    expect(juni).toBeCloseTo(0, 2);
    expect(juni).not.toBeLessThan(0);
  });
});

describe('kontinuitas bulan (M-05)', () => {
  it('lubang bulan tidak diatribusikan sebagai return satu bulan', () => {
    // Maret-Mei hilang (mis. suspensi). Return Juni tidak boleh berisi lonjakan 4 bulan.
    const candles = [
      bar('2025-01-31', 1000),
      bar('2025-02-28', 1050),
      bar('2025-06-30', 2000),
      bar('2025-07-31', 2100),
    ];
    const row = calculateMonthlySeasonality(candles).matrix.find((r) => r.year === 2025)!;
    expect(row.months[1]).toBeCloseTo(5, 2); // Feb vs Jan - bersebelahan, sah
    expect(row.months[5]).toBeNull(); // Juni - bulan sebelumnya hilang
    expect(row.months[6]).toBeCloseTo(5, 2); // Juli vs Juni - bersebelahan lagi
  });

  it('bulan pertama tidak punya acuan dan dibiarkan kosong', () => {
    const row = calculateMonthlySeasonality([bar('2025-01-31', 1000), bar('2025-02-28', 1100)])
      .matrix.find((r) => r.year === 2025)!;
    expect(row.months[0]).toBeNull();
    expect(row.months[1]).toBeCloseTo(10, 2);
  });

  it('pergantian tahun tetap dianggap bersebelahan (Des -> Jan)', () => {
    const result = calculateMonthlySeasonality([bar('2024-12-31', 1000), bar('2025-01-31', 1200)]);
    expect(result.matrix.find((r) => r.year === 2025)?.months[0]).toBeCloseTo(20, 2);
  });
});

describe('zona waktu bursa (M-06)', () => {
  it('bar 1 Februari 03:00Z masuk ke Februari WIB, bukan Januari', () => {
    // 2025-02-01T03:00Z = 2025-02-01 10:00 WIB. Pada server UTC-8 `getMonth()` lama
    // membacanya sebagai 31 Januari dan memasukkannya ke ember Januari.
    const result = calculateMonthlySeasonality([
      bar('2024-12-31', 1000),
      bar('2025-01-31', 1000),
      { time: '2025-02-01T03:00:00Z', close: 1100, adjClose: 1100 },
    ]);
    const row = result.matrix.find((r) => r.year === 2025)!;
    expect(row.months[1]).toBeCloseTo(10, 2); // return masuk Februari
  });

  it('bar 31 Desember 20:00Z sudah 1 Januari WIB', () => {
    // 2024-12-31T20:00Z = 2025-01-01 03:00 WIB.
    const result = calculateMonthlySeasonality([
      bar('2024-11-29', 1000),
      bar('2024-12-30', 1000),
      { time: '2024-12-31T20:00:00Z', close: 1200, adjClose: 1200 },
    ]);
    expect(result.matrix.find((r) => r.year === 2025)?.months[0]).toBeCloseTo(20, 2);
  });
});

describe('agregat', () => {
  it('win rate & rata-rata dihitung atas sel yang sah saja', () => {
    const candles = [
      bar('2023-12-29', 1000),
      bar('2024-01-31', 1100), // Jan 2024 +10%
      bar('2024-12-31', 1000),
      bar('2025-01-31', 900), // Jan 2025 -10%
    ];
    const result = calculateMonthlySeasonality(candles);
    expect(result.monthCounts[0]).toBe(2);
    expect(result.monthWinRates[0]).toBeCloseTo(50, 1);
    expect(result.monthAverages[0]).toBeCloseTo(0, 1);
  });

  it('data kosong mengembalikan status UNAVAILABLE, bukan matriks nol', () => {
    const result = calculateMonthlySeasonality([]);
    expect(result.basis).toBe('UNAVAILABLE');
    expect(result.bestMonth).toBeNull();
    expect(result.worstMonth).toBeNull();
  });
});

/**
 * Kasus 2-tahun dari versi test sebelumnya, dipertahankan dan disesuaikan ke kontrak baru.
 *
 * PERUBAHAN PERILAKU YANG DISENGAJA (M-05): versi lama mengharapkan Jan 2024 = +10% yang
 * dihitung dari `firstClose` -> `lastClose` DI DALAM bulan Januari, karena tidak ada bulan
 * sebelumnya. Return dalam-bulan tidak sebanding dengan sel lain yang bulan-ke-bulan, jadi
 * sekarang bulan pertama dibiarkan kosong. Bar Desember 2023 ditambahkan sebagai acuan
 * supaya Januari 2024 tetap punya pembanding yang sah.
 */
describe('regresi - matriks 2 tahun', () => {
  const candles = [
    bar('2023-12-29', 1000),
    bar('2024-01-31', 1100), // Jan 2024: +10%
    bar('2024-02-29', 1045), // Feb 2024: -5%
    bar('2024-12-30', 1200),
    bar('2025-01-31', 1320), // Jan 2025: +10%
    bar('2025-02-28', 1386), // Feb 2025: +5%
  ];

  it('menyusun matriks per tahun, terbaru lebih dulu', () => {
    const result = calculateMonthlySeasonality(candles);
    expect(result.matrix.map((r) => r.year)).toEqual([2025, 2024, 2023]);
  });

  it('rata-rata & win rate Januari dan Februari', () => {
    const result = calculateMonthlySeasonality(candles);
    expect(result.monthAverages[0]).toBe(10); // Jan: (10 + 10) / 2
    expect(result.monthWinRates[0]).toBe(100);
    expect(result.monthAverages[1]).toBe(0); // Feb: (-5 + 5) / 2
    expect(result.monthWinRates[1]).toBe(50);
  });

  it('bulan tanpa acuan bulan sebelumnya dibiarkan kosong, bukan diisi return dalam-bulan', () => {
    const result = calculateMonthlySeasonality(candles);
    expect(result.matrix.find((r) => r.year === 2023)?.months[11]).toBeNull();
  });
});
