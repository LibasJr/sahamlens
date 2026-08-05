import { describe, expect, it } from 'vitest';
import { buildBucketRows, buildTop5EquityCurve } from '../transparency.service';
import type { CalibrationObservation } from '../calibration.service';

function obs(partial: Partial<CalibrationObservation>): CalibrationObservation {
  return {
    ticker: 'AAAA.JK',
    signalDate: '2026-01-01',
    entryDate: '2026-01-02',
    exitDateT20: '2026-01-21',
    lensScore: 85,
    bucket: '80-100',
    marketCap: 1_000_000_000,
    returnT5: 1,
    returnT20: 5,
    ...partial,
  };
}

describe('transparency.service', () => {
  it('membangun bucket rows dari lens_bucket_stats dan fallback observasi real untuk metric baru', () => {
    const result = buildBucketRows([
      {
        run_date: '2026-02-01',
        bucket: '80-100',
        avg_t1: '1.1',
        avg_t5: '2.2',
        avg_t20: '3.3',
        win_rate_t20: '55',
        total_samples: '10',
        max_drawdown_t20: null,
        avg_win_t20: null,
        avg_loss_t20: null,
        source_rows: '100',
      },
    ], [
      obs({ returnT20: 10 }),
      obs({ returnT20: -4 }),
    ]);

    const high = result.rows.find((row) => row.bucket === '80-100')!;
    expect(result.latestStatsRunDate).toBe('2026-02-01');
    expect(high.avgT1).toBe(1.1);
    expect(high.avgT20).toBe(3.3);
    expect(high.maxDrawdownT20).toBe(-4);
    expect(high.avgWinT20).toBe(10);
    expect(high.avgLossT20).toBe(-4);
  });

  it('membangun equity curve Top 5 LensRadar vs IHSG dari window entry/exit yang sama', () => {
    const observations = [
      obs({ ticker: 'A.JK', signalDate: '2026-01-01', lensScore: 90, returnT20: 10 }),
      obs({ ticker: 'B.JK', signalDate: '2026-01-01', lensScore: 89, returnT20: 0 }),
      obs({ ticker: 'C.JK', signalDate: '2026-01-01', lensScore: 88, returnT20: 5 }),
      obs({ ticker: 'D.JK', signalDate: '2026-01-01', lensScore: 87, returnT20: -5 }),
      obs({ ticker: 'E.JK', signalDate: '2026-01-01', lensScore: 86, returnT20: 15 }),
      obs({ ticker: 'F.JK', signalDate: '2026-01-01', lensScore: 60, returnT20: 100 }),
      obs({ ticker: 'A.JK', signalDate: '2026-01-02', entryDate: '2026-01-03', exitDateT20: '2026-01-22', lensScore: 90, returnT20: 10 }),
    ];
    const curve = buildTop5EquityCurve(observations, [
      { date: '2026-01-02', open: 100, close: 100 },
      { date: '2026-01-03', open: 100, close: 100 },
      { date: '2026-01-21', open: 100, close: 110 },
      { date: '2026-01-22', open: 100, close: 120 },
    ]);

    expect(curve).toHaveLength(2);
    // Hari pertama hanya 5 skor teratas dipakai: avg (10+0+5-5+15)/5 = 5%.
    expect(curve[0].lensTop5).toBe(105);
    // IHSG return hari pertama: (110/100-1)*100 - 0.5 = 9.5%.
    expect(curve[0].ihsg).toBe(109.5);
    expect(curve[0].signals).toBe(5);
  });
});
