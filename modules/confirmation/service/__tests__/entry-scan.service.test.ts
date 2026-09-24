import { describe, expect, it } from 'vitest';

import { ENTRY_SCAN_OPTIONS, buildEntryScan, splitByLiquidity, stdevOfLogReturns } from '../entry-scan.service';

function series(length: number, mapper: (index: number) => number, startDate = '2026-01-01'): { closes: number[]; dates: string[] } {
  const closes: number[] = [];
  const dates: string[] = [];
  const base = new Date(`${startDate}T00:00:00Z`);
  for (let index = 0; index < length; index += 1) {
    closes.push(mapper(index));
    const day = new Date(base.getTime() + index * 86_400_000);
    dates.push(day.toISOString().slice(0, 10));
  }
  return { closes, dates };
}

describe('stdevOfLogReturns', () => {
  it('menghitung simpangan baku imbal hasil logaritma secara eksplisit', () => {
    // r1 = ln(1,1), r2 = ln(0,9) -> simpangan baku sampel = 0,141898...
    expect(stdevOfLogReturns([100, 110, 99])).toBeCloseTo(0.141898, 5);
  });

  it('tidak mengarang angka saat deret terlalu pendek', () => {
    expect(stdevOfLogReturns([100])).toBeNull();
    expect(stdevOfLogReturns([])).toBeNull();
  });
});

describe('buildEntryScan', () => {
  it('menyatakan data kurang apa adanya, bukan menambal', () => {
    const short = series(30, (index) => 100 + index);
    const result = buildEntryScan('AAAA.JK', short.closes, short.dates);
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.sessions).toBe(30);
    expect(result.lastClose).toBeNull();
    expect(result.support).toBeNull();
    expect(result.riskReward).toBeNull();
    expect(result.note).toContain('30 sesi');
  });

  it('memakai penutupan terendah/tertinggi jendela sebagai level', () => {
    const long = series(80, (index) => 1000 + Math.sin(index / 3) * 50);
    const result = buildEntryScan('BBBB.JK', long.closes, long.dates);
    const window = long.closes.slice(-ENTRY_SCAN_OPTIONS.levelWindow);

    expect(result.status).toBe('OK');
    expect(result.sessions).toBe(80);
    expect(result.support).toBe(Math.min(...window));
    expect(result.resistance).toBe(Math.max(...window));
    expect(result.entry).toBe(result.support);
    expect(result.target).toBe(result.resistance);
    expect(result.lastDate).toBe(long.dates[long.dates.length - 1]);
  });

  it('menghitung henti rugi dan rasio risiko/imbal dari volatilitas sendiri', () => {
    const long = series(80, (index) => 2000 * Math.exp(Math.sin(index / 4) * 0.02));
    const result = buildEntryScan('CCCC.JK', long.closes, long.dates);
    const volatility = (result.volatilityPct ?? 0) / 100;

    expect(volatility).toBeGreaterThan(0);
    expect(result.stop).toBeCloseTo((result.support ?? 0) * (1 - ENTRY_SCAN_OPTIONS.stopVolatilityMultiple * volatility), 6);
    const risk = (result.entry ?? 0) - (result.stop ?? 0);
    const reward = (result.target ?? 0) - (result.entry ?? 0);
    expect(result.riskReward).toBeCloseTo(reward / risk, 6);
  });

  it('tidak memaksakan rasio saat pembaginya nol: deret datar memberi null, bukan nol atau tak hingga', () => {
    const flat = series(80, () => 1500);
    const result = buildEntryScan('DDDD.JK', flat.closes, flat.dates);
    expect(result.status).toBe('OK');
    expect(result.volatilityPct).toBe(0);
    expect(result.stop).toBe(result.support);
    expect(result.riskReward).toBeNull();
    expect(Number.isFinite(result.riskReward ?? 0)).toBe(true);
  });

  it('memakai ambang yang dinyatakan terbuka', () => {
    expect(ENTRY_SCAN_OPTIONS.minimumSessions).toBe(60);
    expect(ENTRY_SCAN_OPTIONS.levelWindow).toBe(20);
    expect(ENTRY_SCAN_OPTIONS.volatilityWindow).toBe(20);
    expect(ENTRY_SCAN_OPTIONS.stopVolatilityMultiple).toBe(2);
    expect(ENTRY_SCAN_OPTIONS.minimumAvgTradedValue20d).toBe(1_000_000_000);
  });

  it('menolak menampilkan henti rugi di bawah nol, bukan menyajikannya sebagai angka', () => {
    // Deret 100/200 bergantian: volatilitas harian ~0,69 sehingga 2x volatilitas > 1.
    const wild = series(80, (index) => (index % 2 === 0 ? 100 : 200));
    const result = buildEntryScan('EEEE.JK', wild.closes, wild.dates);

    expect(result.status).toBe('OK');
    expect(result.stop).toBeLessThanOrEqual(0);
    expect(result.riskReward).toBeNull();
    expect(result.note).toContain('di bawah nol');
  });
});

describe('splitByLiquidity', () => {
  it('memisahkan emiten di bawah ambang dan yang likuiditasnya belum tercatat', () => {
    const solid = buildEntryScan('AAAA.JK', series(80, (index) => 1000 + (index % 5)).closes, series(80, (index) => 1000 + (index % 5)).dates);
    const thin = buildEntryScan('BBBB.JK', series(80, (index) => 1000 + (index % 5)).closes, series(80, (index) => 1000 + (index % 5)).dates);
    const unknown = buildEntryScan('CCCC.JK', series(80, (index) => 1000 + (index % 5)).closes, series(80, (index) => 1000 + (index % 5)).dates);

    const liquidity = new Map<string, number | null>([
      ['AAAA.JK', 5_000_000_000],
      ['BBBB.JK', 50_000_000],
      ['CCCC.JK', null],
    ]);

    const { eligible, belowFloor } = splitByLiquidity([solid, thin, unknown], liquidity, ENTRY_SCAN_OPTIONS.minimumAvgTradedValue20d);

    expect(eligible.map((row) => row.ticker)).toEqual(['AAAA.JK']);
    expect(belowFloor.map((row) => row.ticker)).toEqual(['BBBB.JK', 'CCCC.JK']);
    expect(belowFloor.every((row) => row.riskReward === null)).toBe(true);
    expect(belowFloor[0].note).toContain('ambang likuiditas');
    expect(belowFloor[1].note).toContain('belum pernah tercatat');
  });
});