import { describe, expect, it } from 'vitest';
import {
  calculateCalibrationObservations,
  calculateThresholdSimulations,
  welchOneTailedGreater,
  type CalibrationObservation,
} from '../calibration.service';
import type { DailyOpenProvider, LensRadarHistoryEntry } from '../bucket-backtest.service';

function row(date: string, ticker: string, score: number, close: number, marketCap = 1_000_000_000): LensRadarHistoryEntry {
  return { date, ticker, lens_score: score, close_price: close, market_cap: marketCap };
}

function provider(openByTicker: Record<string, Record<string, number>>): DailyOpenProvider {
  return {
    async getDailyOpenBars(ticker: string) {
      return Object.entries(openByTicker[ticker] ?? {}).map(([date, open]) => ({ date, open }));
    },
  };
}

describe('calibration.service', () => {
  it('membuat observasi kalibrasi dari entry open H+1 dan exit close T+20', async () => {
    const rows: LensRadarHistoryEntry[] = [];
    const opens: Record<string, Record<string, number>> = { 'AAAA.JK': {} };
    for (let i = 1; i <= 21; i++) {
      const date = `2026-01-${String(i).padStart(2, '0')}`;
      rows.push(row(date, 'AAAA.JK', i === 1 ? 85 : 50, 100 + i));
      opens['AAAA.JK'][date] = 100;
    }

    const result = await calculateCalibrationObservations(rows, provider(opens));
    const first = result.observations[0];

    expect(result.normalizedRows).toBe(21);
    expect(result.uniqueTickers).toBe(1);
    expect(first.signalDate).toBe('2026-01-01');
    expect(first.entryDate).toBe('2026-01-02');
    expect(first.bucket).toBe('80-100');
    // Exit T+20 = close index 20 = 121, entry open H+1 = 100, net cost 0.5%.
    expect(first.returnT20).toBeCloseTo(20.5);
  });

  it('menghitung simulasi threshold win rate dan perubahan jumlah sinyal vs ambang 80', () => {
    const observations: CalibrationObservation[] = [
      { ticker: 'A', signalDate: '2026-01-01', entryDate: '2026-01-02', exitDateT20: '2026-01-21', lensScore: 85, bucket: '80-100', marketCap: null, returnT5: 1, returnT20: 5 },
      { ticker: 'B', signalDate: '2026-01-01', entryDate: '2026-01-02', exitDateT20: '2026-01-21', lensScore: 80, bucket: '80-100', marketCap: null, returnT5: 1, returnT20: -2 },
      { ticker: 'C', signalDate: '2026-01-01', entryDate: '2026-01-02', exitDateT20: '2026-01-21', lensScore: 75, bucket: '70-79', marketCap: null, returnT5: 1, returnT20: 3 },
      { ticker: 'D', signalDate: '2026-01-01', entryDate: '2026-01-02', exitDateT20: null, lensScore: 70, bucket: '70-79', marketCap: null, returnT5: 1, returnT20: null },
    ];

    const sims = calculateThresholdSimulations(observations);
    const threshold75 = sims.find((sim) => sim.threshold === 75)!;
    const threshold80 = sims.find((sim) => sim.threshold === 80)!;

    expect(threshold80.totalSignals).toBe(2);
    expect(threshold80.winRateT20).toBe(50);
    expect(threshold75.totalSignals).toBe(3);
    expect(threshold75.winRateT20).toBe(66.67);
    expect(threshold75.signalDeltaPctVs80).toBe(50);
  });

  it('Welch one-tailed t-test mendeteksi bucket tinggi signifikan lebih baik', () => {
    const result = welchOneTailedGreater([10, 11, 12, 13, 14], [-5, -4, -6, -7, -3]);

    expect(result.tStatistic).not.toBeNull();
    expect(result.pValue).not.toBeNull();
    expect(result.significant).toBe(true);
  });
});
