import { describe, expect, it } from 'vitest';
import {
  RADAR_SORTABLE_COLUMNS,
  compareRadarValues,
  displayTicker,
  scoreBarWidth,
  type AiPickItem,
} from '../radar-model';

function pick(overrides: Partial<AiPickItem> = {}): AiPickItem {
  return {
    symbol: 'BBCA.JK',
    price: 10000,
    changePct: 1.25,
    baseScore: 70,
    finalScore: 75,
    coverage: 90,
    flagged: false,
    flagReason: null,
    breakdown: { technical: 30, fundamental: 20, flow: 25 },
    ...overrides,
  };
}

describe('radar-model', () => {
  it('menaruh nilai kosong setelah nilai nyata pada kedua arah sort', () => {
    expect(compareRadarValues(null, 10, 'asc')).toBe(1);
    expect(compareRadarValues(null, 10, 'desc')).toBe(1);
    expect(compareRadarValues(10, null, 'asc')).toBe(-1);
  });

  it('mengurutkan angka sesuai arah dan simbol secara locale-aware', () => {
    expect(compareRadarValues(10, 20, 'asc')).toBeLessThan(0);
    expect(compareRadarValues(10, 20, 'desc')).toBeGreaterThan(0);
    expect(compareRadarValues('BBCA', 'TLKM', 'asc')).toBeLessThan(0);
  });

  it('mengambil breakdown yang benar untuk kolom score', () => {
    const item = pick();
    const values = Object.fromEntries(RADAR_SORTABLE_COLUMNS.map((column) => [column.key, column.getValue(item)]));
    expect(values.technicalScore).toBe(30);
    expect(values.fundamentalScore).toBe(20);
    expect(values.flowScore).toBe(25);
    expect(values.coverage).toBe(90);
  });

  it('membatasi lebar score bar ke 0-100%', () => {
    expect(scoreBarWidth(20, 40)).toBe(50);
    expect(scoreBarWidth(100, 40)).toBe(100);
    expect(scoreBarWidth(-5, 40)).toBe(0);
    expect(scoreBarWidth(undefined, 40)).toBe(0);
  });

  it('menormalisasi ticker IDX untuk tampilan', () => {
    expect(displayTicker('BBCA.JK')).toBe('BBCA');
    expect(displayTicker('BBCA')).toBe('BBCA');
  });
});
