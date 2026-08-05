import { describe, expect, it } from 'vitest';
import {
  calculateLensBucketStats,
  LENS_BUCKET_ROUND_TRIP_COST_PCT,
  type DailyOpenProvider,
  type LensRadarHistoryEntry,
} from '../bucket-backtest.service';
import { RETURN_PRICE_BASIS } from '@/shared/market/price-basis';

function row(date: string, ticker: string, score: number, close: number, marketCap = 1_000_000_000): LensRadarHistoryEntry {
  return {
    date,
    ticker,
    lens_score: score,
    close_price: close,
    raw_close_price: close,
    adjusted_close_price: close,
    price_basis: RETURN_PRICE_BASIS,
    market_cap: marketCap,
    score_version: 'lens-score-v1.3.0',
  };
}

function dateFromStart(offsetDays: number): string {
  const d = new Date(Date.UTC(2026, 0, 1 + offsetDays));
  return d.toISOString().slice(0, 10);
}

function provider(openByTicker: Record<string, Record<string, number>>): DailyOpenProvider {
  return {
    async getDailyOpenBars(ticker: string) {
      return Object.entries(openByTicker[ticker] ?? {}).map(([date, open]) => ({ date, open, priceBasis: RETURN_PRICE_BASIS }));
    },
  };
}

describe('calculateLensBucketStats', () => {
  it('menghitung forward return dari open H+1, bukan close hari sinyal', async () => {
    const rows = [
      row('2026-01-01', 'AAAA.JK', 85, 100),
      row('2026-01-02', 'AAAA.JK', 55, 110),
      row('2026-01-03', 'AAAA.JK', 55, 130),
      row('2026-01-04', 'AAAA.JK', 55, 140),
      row('2026-01-05', 'AAAA.JK', 55, 150),
      row('2026-01-06', 'AAAA.JK', 55, 160),
    ];
    const result = await calculateLensBucketStats(rows, provider({
      'AAAA.JK': { '2026-01-02': 105, '2026-01-03': 120, '2026-01-04': 135, '2026-01-05': 145, '2026-01-06': 155 },
    }), '2026-01-06');

    const high = result.stats.find((s) => s.bucket === '80-100')!;

    expect(result.roundTripCostPct).toBe(LENS_BUCKET_ROUND_TRIP_COST_PCT);
    // Sinyal 2026-01-01 entry di open 2026-01-02=105, exit T+1 close 2026-01-02=110:
    // (110/105 - 1) * 100 - 0.5 = 4.26%.
    expect(high.avg_T1).toBe(4.26);
    expect(high.avg_T5).toBe(51.88);
    expect(high.totalSamples).toBe(1);
  });

  it('membuat 4 bucket dengan shape output Strategy Builder', async () => {
    const rows: LensRadarHistoryEntry[] = [];
    for (let i = 0; i < 25; i++) {
      const date = dateFromStart(i);
      rows.push(row(date, 'HIGH.JK', 82, 100 + i * 2));
      rows.push(row(date, 'MID.JK', 72, 100 + i));
      rows.push(row(date, 'LOW.JK', 62, 100 - i));
      rows.push(row(date, 'BAD.JK', 45, 80 - i));
    }
    const opens: Record<string, Record<string, number>> = {};
    for (const ticker of ['HIGH.JK', 'MID.JK', 'LOW.JK', 'BAD.JK']) {
      opens[ticker] = {};
      for (let i = 0; i < 25; i++) opens[ticker][dateFromStart(i)] = 100;
    }

    const result = await calculateLensBucketStats(rows, provider(opens), '2026-01-25');

    expect(result.stats.map((s) => s.bucket)).toEqual(['80-100', '70-79', '60-69', '<60']);
    for (const stat of result.stats) {
      expect(Object.keys(stat)).toEqual([
        'bucket',
        'avg_T1',
        'avg_T5',
        'avg_T20',
        'winRate_T5',
        'winRate_T20',
        'maxDrawdown_T20',
        'avgWin_T20',
        'avgLoss_T20',
        'totalSamples',
      ]);
    }
  });

  it('melewati entry jika open H+1 tidak tersedia dari provider harga', async () => {
    const result = await calculateLensBucketStats([
      row('2026-01-01', 'AAAA.JK', 85, 100),
      row('2026-01-02', 'AAAA.JK', 85, 110),
    ], provider({ 'AAAA.JK': {} }), '2026-01-02');

    expect(result.stats.find((s) => s.bucket === '80-100')?.totalSamples).toBe(0);
  });

  it('mengabaikan skor/harga invalid, bukan mengarang sampel', async () => {
    const result = await calculateLensBucketStats([
      row('2026-01-01', 'AAAA.JK', 120, 100),
      row('2026-01-02', 'AAAA.JK', 85, 0),
      { date: 'bad-date', ticker: 'AAAA.JK', lens_score: 85, close_price: 100, market_cap: null },
    ], provider({ 'AAAA.JK': { '2026-01-02': 100 } }), '2026-01-02');

    expect(result.sourceRows).toBe(0);
    expect(result.stats.every((s) => s.totalSamples === 0)).toBe(true);
  });

  it('menerima filter score_version eksplisit dan tidak mencampur versi scoring', async () => {
    const rows: LensRadarHistoryEntry[] = [];
    const opens: Record<string, Record<string, number>> = { 'NEW.JK': {}, 'OLD.JK': {} };
    for (let i = 0; i < 6; i++) {
      const date = dateFromStart(i);
      rows.push({ ...row(date, 'NEW.JK', 85, 100 + i * 10), score_version: 'lens-score-v1.3.0' });
      rows.push({ ...row(date, 'OLD.JK', 85, 500 - i * 10), score_version: 'lens-score-v1.2.0' });
      opens['NEW.JK'][date] = 100;
      opens['OLD.JK'][date] = 500;
    }

    const result = await calculateLensBucketStats(rows, provider(opens), '2026-01-06', {
      scoreVersion: 'lens-score-v1.2.0',
    });

    expect(result.scoreVersion).toBe('lens-score-v1.2.0');
    expect(result.rejectedRows).toBe(6);
    expect(result.sourceRows).toBe(6);
    expect(result.stats.find((s) => s.bucket === '80-100')?.avg_T1).toBeLessThan(0);
  });

  it('stock split 1:5 memakai adjusted close, bukan raw return -80%', async () => {
    const rows: LensRadarHistoryEntry[] = [
      { ...row('2026-01-01', 'SPLT.JK', 85, 5000), adjusted_close_price: 1000 },
      { ...row('2026-01-02', 'SPLT.JK', 85, 1000), adjusted_close_price: 1000 },
    ];

    const result = await calculateLensBucketStats(rows, provider({
      'SPLT.JK': { '2026-01-02': 1000 },
    }), '2026-01-02');

    expect(result.priceBasis).toBe(RETURN_PRICE_BASIS);
    expect(result.stats.find((s) => s.bucket === '80-100')?.avg_T1).toBe(-0.5);
  });

  it('legacy unknown price basis tidak masuk validasi baru', async () => {
    const legacy = { ...row('2026-01-01', 'OLD.JK', 85, 100), price_basis: null, adjusted_close_price: null };
    const next = { ...row('2026-01-02', 'OLD.JK', 85, 101), price_basis: null, adjusted_close_price: null };

    const result = await calculateLensBucketStats([legacy, next], provider({
      'OLD.JK': { '2026-01-02': 100 },
    }), '2026-01-02');

    expect(result.sourceRows).toBe(0);
    expect(result.stats.every((s) => s.totalSamples === 0)).toBe(true);
  });
});
