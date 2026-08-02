import { describe, it, expect } from 'vitest';
import { computeDailyNetFlow, computeAccumulationStreak, analyzeBandarmology } from '../foreign-flow-proxy';

describe('computeDailyNetFlow (Chaikin Money Flow)', () => {
  it('menghitung MFM/netValueBillion sesuai contoh: High 280, Low 260, Close 275, Volume 10jt', () => {
    // MFM = ((275-260)-(280-275))/(280-260) = (15-5)/20 = 0.5
    // netValueBillion = 0.5 * 10_000_000 * 275 / 1e9 = 1.375, dibulatkan 2 desimal -> 1.38
    const [point] = computeDailyNetFlow([{ date: '2026-08-01', high: 280, low: 260, close: 275, volume: 10_000_000 }]);
    expect(point.netValueBillion).toBe(1.38);
  });

  it('close di HIGH (tekanan beli penuh) -> MFM = +1, netValueBillion positif penuh', () => {
    const [point] = computeDailyNetFlow([{ date: '2026-08-01', high: 100, low: 90, close: 100, volume: 1_000_000 }]);
    // MFM = ((100-90)-(100-100))/10 = 1
    expect(point.netValueBillion).toBeCloseTo((1 * 1_000_000 * 100) / 1e9, 6);
  });

  it('close di LOW (tekanan jual penuh) -> MFM = -1, netValueBillion negatif penuh', () => {
    const [point] = computeDailyNetFlow([{ date: '2026-08-01', high: 100, low: 90, close: 90, volume: 1_000_000 }]);
    expect(point.netValueBillion).toBeCloseTo((-1 * 1_000_000 * 90) / 1e9, 6);
  });

  it('High === Low (hari tanpa range) -> MFM 0, tidak divide-by-zero/NaN', () => {
    const [point] = computeDailyNetFlow([{ date: '2026-08-01', high: 100, low: 100, close: 100, volume: 500_000 }]);
    expect(point.netValueBillion).toBe(0);
    expect(Number.isNaN(point.netValueBillion)).toBe(false);
  });
});

describe('computeAccumulationStreak', () => {
  it('menghitung streak hari positif berturut-turut dari belakang', () => {
    const daily = [
      { date: '1', netValueBillion: -1 },
      { date: '2', netValueBillion: 2 },
      { date: '3', netValueBillion: 3 },
    ];
    expect(computeAccumulationStreak(daily)).toBe(2);
  });

  it('0 kalau hari terakhir sudah negatif', () => {
    const daily = [{ date: '1', netValueBillion: 5 }, { date: '2', netValueBillion: -1 }];
    expect(computeAccumulationStreak(daily)).toBe(0);
  });
});

describe('analyzeBandarmology', () => {
  function daysWithCLV(count: number, clv: number, volume = 1_000_000): { date: string; high: number; low: number; close: number; volume: number }[] {
    // High-Low tetap 20 (skala sembarang), close diposisikan sesuai CLV target: close = low + clv*(high-low)
    const high = 120;
    const low = 100;
    const close = low + clv * (high - low);
    return Array.from({ length: count }, (_, i) => ({ date: `d${i}`, high, low, close, volume }));
  }

  it('CMF20 > 20 dan CLV > 0.6 -> BULLISH', () => {
    const result = analyzeBandarmology(daysWithCLV(20, 0.9));
    expect(result.status).toBe('BULLISH');
    expect(result.cmf20).toBeGreaterThan(20);
    expect(result.clv).toBeCloseTo(0.9, 2);
  });

  it('CMF20 < -20 dan CLV < 0.4 -> BEARISH', () => {
    const result = analyzeBandarmology(daysWithCLV(20, 0.1));
    expect(result.status).toBe('BEARISH');
    expect(result.cmf20).toBeLessThan(-20);
  });

  it('CLV di tengah (0.5) -> NEUTRAL', () => {
    const result = analyzeBandarmology(daysWithCLV(20, 0.5));
    expect(result.status).toBe('NEUTRAL');
  });

  it('history kosong -> NEUTRAL, tidak error', () => {
    const result = analyzeBandarmology([]);
    expect(result.status).toBe('NEUTRAL');
    expect(result.cmf20).toBe(0);
  });
});
