import { describe, expect, it } from 'vitest';
import { calculateAdx, ADX_PERIOD } from '../adx';
import type { TrueRangeBar } from '../atr';

// Generator bar sintetis - tren naik/turun murni (tiap bar bergerak `dir x 10` dari bar
// sebelumnya, range +/-5 di sekitar close) dan sideways (berosilasi +/-3 di sekitar 1000,
// TANPA net directional movement). Nilai acuan ADX/DI dihitung lewat implementasi KEDUA
// yang ditulis terpisah (algoritma sama, kode berbeda), lihat scratchpad/
// verify-indicators.mjs pada sesi pengembangan fitur ini.
function trendBars(n: number, dir: 1 | -1): TrueRangeBar[] {
  const bars: TrueRangeBar[] = [];
  let base = 1000;
  for (let i = 0; i < n; i++) {
    base += dir * 10;
    bars.push({ high: base + 5, low: base - 5, close: base });
  }
  return bars;
}

function sidewaysBars(n: number): TrueRangeBar[] {
  const bars: TrueRangeBar[] = [];
  for (let i = 0; i < n; i++) {
    const base = 1000 + (i % 2 === 0 ? 3 : -3);
    bars.push({ high: base + 1, low: base - 1, close: base });
  }
  return bars;
}

describe('calculateAdx - GOLDEN (nilai acuan dari implementasi independen)', () => {
  it('tren naik kuat murni 40 bar -> ADX=100, +DI dominan, -DI=0', () => {
    const result = calculateAdx(trendBars(40, 1));
    expect(result).not.toBeNull();
    expect(result!.adx).toBeCloseTo(100, 6);
    expect(result!.plusDi).toBeCloseTo(66.66666666666667, 6);
    expect(result!.minusDi).toBeCloseTo(0, 6);
  });

  it('tren turun kuat murni 40 bar -> ADX=100, -DI dominan, +DI=0', () => {
    const result = calculateAdx(trendBars(40, -1));
    expect(result).not.toBeNull();
    expect(result!.adx).toBeCloseTo(100, 6);
    expect(result!.minusDi).toBeCloseTo(66.66666666666667, 6);
    expect(result!.plusDi).toBeCloseTo(0, 6);
  });

  it('sideways murni (osilasi tanpa net directional movement) -> ADX rendah, acuan 3.667', () => {
    const result = calculateAdx(sidewaysBars(40));
    expect(result).not.toBeNull();
    expect(result!.adx).toBeCloseTo(3.6673068948810084, 6);
  });
});

describe('calculateAdx - sifat & guard', () => {
  it('bar kurang dari 2 x period -> null, bukan angka setengah jadi', () => {
    expect(calculateAdx(trendBars(2 * ADX_PERIOD - 1, 1))).toBeNull();
  });

  it('tepat 2 x period bar -> menghasilkan nilai (ambang minimum, bukan gagal)', () => {
    const result = calculateAdx(trendBars(2 * ADX_PERIOD, 1));
    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.adx)).toBe(true);
  });

  it('ADX selalu di [0,100], +DI/-DI selalu >= 0, untuk tren maupun sideways', () => {
    for (const bars of [trendBars(50, 1), trendBars(50, -1), sidewaysBars(50)]) {
      const result = calculateAdx(bars)!;
      expect(result.adx).toBeGreaterThanOrEqual(0);
      expect(result.adx).toBeLessThanOrEqual(100);
      expect(result.plusDi).toBeGreaterThanOrEqual(0);
      expect(result.minusDi).toBeGreaterThanOrEqual(0);
    }
  });

  it('tren kuat menghasilkan ADX jauh lebih tinggi daripada sideways pada jumlah bar yang sama', () => {
    const trending = calculateAdx(trendBars(40, 1))!;
    const flat = calculateAdx(sidewaysBars(40))!;
    expect(trending.adx).toBeGreaterThan(flat.adx);
  });
});
