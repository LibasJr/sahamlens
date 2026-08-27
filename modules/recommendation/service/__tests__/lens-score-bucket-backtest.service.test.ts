import { describe, expect, it } from 'vitest';
import {
  computeLensScoreBucketBacktest,
  LENS_SCORE_ROUND_TRIP_COST_PCT,
  type LensRadarHistoryRow,
} from '../lens-score-bucket-backtest.service';
import { RETURN_PRICE_BASIS } from '@/shared/market/price-basis';
import { SCORE_VERSION } from '@/modules/lens-radar/constants/model-version';
import { LENS_SCORE_MODEL_METADATA } from '@/modules/technical/config/lens-score-model';

function row(date: string, ticker: string, score: number, close: number): LensRadarHistoryRow {
  return {
    date,
    ticker,
    lens_score: score,
    close_price: close,
    raw_close_price: close,
    adjusted_close_price: close,
    price_basis: RETURN_PRICE_BASIS,
    score_version: SCORE_VERSION,
    score_config_hash: LENS_SCORE_MODEL_METADATA.configHash,
    universe_version: 'idx-liquid-v2026-08-17',
    coverage_pct: 100,
    eligibility_status: 'ELIGIBLE',
    universe_eligible: true,
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
    expect(result.provenance).toMatchObject({
      source: 'lens_radar_history',
      asOf: dateFromStart(6),
      confidence: 'calculated',
      isEstimated: false,
      modelVersion: SCORE_VERSION,
      universeVersion: 'idx-liquid-v2026-08-17',
      universeMixed: false,
    });
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
      rows.push({ ...row(dateFromStart(i), 'NEW.JK', 85, 100 * 1.1 ** i), score_version: SCORE_VERSION });
      rows.push({ ...row(dateFromStart(i), 'OLD.JK', 85, 100 * 0.9 ** i), score_version: 'lens-score-v1.2.0', score_config_hash: 'legacy-v1.2-hash' });
      rows.push({ ...row(dateFromStart(i), 'LEGACY.JK', 85, 100), score_version: null });
    }

    const result = computeLensScoreBucketBacktest(rows, {
      scoreVersion: 'lens-score-v1.2.0',
      scoreConfigHash: 'legacy-v1.2-hash',
    });

    expect(result.scoreVersion).toBe('lens-score-v1.2.0');
    expect(result.rejectedRows).toBe(14);
    expect(result.rowsRead).toBe(7);
    expect(result.buckets.find((b) => b.bucket === '80-100')?.horizons.t1.avgReturnPct).toBeLessThan(0);
  });

  it('FAIL-CLOSED: menolak versi sama dengan hash konfigurasi berbeda atau kosong', () => {
    const valid = row('2026-01-01', 'VALID.JK', 85, 100);
    const result = computeLensScoreBucketBacktest([
      valid,
      { ...valid, ticker: 'MIXED.JK', score_config_hash: 'different-config' },
      { ...valid, ticker: 'UNHASHED.JK', score_config_hash: null },
    ]);

    expect(result.rowsRead).toBe(1);
    expect(result.rejectedRows).toBe(2);
    expect(result.configRejectedRows).toBe(2);
    expect(result.scoreConfigHash).toBe(LENS_SCORE_MODEL_METADATA.configHash);
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

  it('does not invent one universe version when accepted rows are mixed', () => {
    const first = row('2026-01-01', 'AAAA.JK', 85, 100);
    const result = computeLensScoreBucketBacktest([
      first,
      { ...first, date: '2026-01-02', universe_version: 'idx-liquid-v-next' },
    ], { calculatedAt: '2026-08-27T12:00:00.000Z' });

    expect(result.provenance.universeVersion).toBeNull();
    expect(result.provenance.universeMixed).toBe(true);
    expect(result.provenance.retrievedAt).toBe('2026-08-27T12:00:00.000Z');
  });
});
