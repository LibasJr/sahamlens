import { describe, expect, it } from 'vitest';
import {
  computeLensScoreBucketBacktest,
  LENS_SCORE_ROUND_TRIP_COST_PCT,
  type LensRadarHistoryRow,
} from '../lens-score-bucket-backtest.service';
import { RETURN_PRICE_BASIS } from '@/shared/market/price-basis';

function row(date: string, ticker: string, score: number, close: number): LensRadarHistoryRow {
  return {
    date,
    ticker,
    lens_score: score,
    close_price: close,
    raw_close_price: close,
    adjusted_close_price: close,
    price_basis: RETURN_PRICE_BASIS,
    score_version: 'lens-score-v1.3.0',
  };
}

function dateFromStart(offsetDays: number): string {
  const d = new Date(Date.UTC(2026, 0, 1 + offsetDays));
  return d.toISOString().slice(0, 10);
}

describe('computeLensScoreBucketBacktest', () => {
  it('mengelompokkan bucket dan menghitung return dari entry close H+1 setelah biaya round-trip 0,5%', () => {
    const rows: LensRadarHistoryRow[] = Array.from({ length: 7 }, (_, i) =>
      row(dateFromStart(i), 'AAAA.JK', 85, 100 * 1.1 ** i)
    );

    const result = computeLensScoreBucketBacktest(rows);

    expect(result.buckets.find((b) => b.bucket === '80-100')?.horizons.t1).toEqual({
      avgReturnPct: 9.5,
      winRatePct: 100,
      samples: 5,
    });
    expect(result.buckets.find((b) => b.bucket === '80-100')?.horizons.t5.samples).toBe(1);
    expect(result.roundTripCostPct).toBe(LENS_SCORE_ROUND_TRIP_COST_PCT);
    expect(result.entryRule).toMatch(/entry close H\+1/i);
  });

  it('menghasilkan t-test sederhana untuk bucket 80-100 dibanding 60-69', () => {
    const rows: LensRadarHistoryRow[] = [];
    let highClose = 100;
    let baseClose = 100;
    for (let i = 0; i < 125; i++) {
      highClose *= i % 2 === 0 ? 1.012 : 1.008;
      baseClose *= i % 2 === 0 ? 1.003 : 1.001;
      rows.push(row(dateFromStart(i), 'HIGH.JK', 85, highClose));
      rows.push(row(dateFromStart(i), 'BASE.JK', 65, baseClose));
    }

    const result = computeLensScoreBucketBacktest(rows);

    expect(result.ready).toBe(true);
    expect(result.coverageDays).toBeGreaterThan(90);
    expect(result.tTests.t20.samples80).toBeGreaterThan(2);
    expect(result.tTests.t20.samples60).toBeGreaterThan(2);
    expect(result.tTests.t20.bucket80Better).toBe(true);
    expect(result.tTests.t20.tStatistic).not.toBeNull();
  });

  it('belum ready jika histori belum lebih dari 90 hari kalender', () => {
    const result = computeLensScoreBucketBacktest([
      row('2026-01-01', 'AAAA.JK', 85, 100),
      row('2026-01-02', 'AAAA.JK', 85, 101),
    ]);

    expect(result.ready).toBe(false);
    expect(result.note).toMatch(/90 hari/i);
  });

  it('melewati skor/harga invalid, bukan mengarang data', () => {
    const result = computeLensScoreBucketBacktest([
      row('2026-01-01', 'AAAA.JK', 120, 100),
      row('2026-01-02', 'AAAA.JK', 80, 0),
      { date: 'bad-date', ticker: 'AAAA.JK', lens_score: 80, close_price: 100, adjusted_close_price: 100, price_basis: RETURN_PRICE_BASIS },
    ]);

    expect(result.rowsRead).toBe(0);
    expect(result.buckets.every((b) => Object.values(b.horizons).every((h) => h.samples === 0))).toBe(true);
  });

  it('menerima filter score_version dan fail-closed terhadap versi lain/legacy', () => {
    const rows: LensRadarHistoryRow[] = [];
    for (let i = 0; i < 7; i++) {
      rows.push({ ...row(dateFromStart(i), 'NEW.JK', 85, 100 * 1.1 ** i), score_version: 'lens-score-v1.3.0' });
      rows.push({ ...row(dateFromStart(i), 'OLD.JK', 85, 100 * 0.9 ** i), score_version: 'lens-score-v1.2.0' });
      rows.push({ ...row(dateFromStart(i), 'LEGACY.JK', 85, 100), score_version: null });
    }

    const result = computeLensScoreBucketBacktest(rows, { scoreVersion: 'lens-score-v1.2.0' });

    expect(result.scoreVersion).toBe('lens-score-v1.2.0');
    expect(result.rejectedRows).toBe(14);
    expect(result.rowsRead).toBe(7);
    expect(result.buckets.find((b) => b.bucket === '80-100')?.horizons.t1.avgReturnPct).toBeLessThan(0);
  });

  it('baris legacy tanpa price_basis tidak masuk validasi baru', () => {
    const rows = [
      { ...row('2026-01-01', 'OLD.JK', 85, 100), price_basis: null, adjusted_close_price: null },
      { ...row('2026-01-02', 'OLD.JK', 85, 500), price_basis: null, adjusted_close_price: null },
    ];

    const result = computeLensScoreBucketBacktest(rows);

    expect(result.rowsRead).toBe(0);
    expect(result.buckets.every((b) => Object.values(b.horizons).every((h) => h.samples === 0))).toBe(true);
  });
});
