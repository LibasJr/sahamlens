import { describe, expect, it } from 'vitest';
import {
  calculateCalibrationObservations,
  calculateThresholdSimulations,
  decorrelateCalibrationObservations,
  recommendCalibrationThreshold,
  welchOneTailedGreater,
  type CalibrationObservation,
} from '../calibration.service';
import type { DailyOpenProvider, LensRadarHistoryEntry } from '../bucket-backtest.service';

function row(date: string, ticker: string, score: number, close: number, marketCap = 1_000_000_000): LensRadarHistoryEntry {
  return { date, ticker, lens_score: score, close_price: close, market_cap: marketCap, score_version: 'lens-score-v1.3.0' };
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
    // Exit T+20 = close hari bursa ke-20 dari sinyal = 121, entry open H+1 = 100, net cost 0.5%.
    expect(first.returnT20).toBeCloseTo(20.5);
  });

  it('menghitung horizon dari kalender bursa global, bukan indeks baris ticker yang bolong', async () => {
    const rows: LensRadarHistoryEntry[] = [];
    const opens: Record<string, Record<string, number>> = { 'AAAA.JK': {} };
    for (let i = 1; i <= 21; i++) {
      const date = `2026-01-${String(i).padStart(2, '0')}`;
      rows.push(row(date, 'BBBB.JK', 50, 100));
      opens['AAAA.JK'][date] = 100;
    }
    rows.push(row('2026-01-01', 'AAAA.JK', 85, 100));
    rows.push(row('2026-01-02', 'AAAA.JK', 85, 101));
    rows.push(row('2026-01-21', 'AAAA.JK', 85, 121));

    const result = await calculateCalibrationObservations(rows, provider(opens));
    const first = result.observations.find((obs) => obs.ticker === 'AAAA.JK' && obs.signalDate === '2026-01-01');

    expect(first?.entryDate).toBe('2026-01-02');
    expect(first?.exitDateT20).toBe('2026-01-21');
    expect(first?.returnT20).toBeCloseTo(20.5);
  });

  it('membuang observasi yang terkena gap aksi korporasi ekstrem', async () => {
    const rows: LensRadarHistoryEntry[] = [];
    for (let i = 1; i <= 21; i++) {
      rows.push(row(`2026-01-${String(i).padStart(2, '0')}`, 'BBBB.JK', 50, 100));
    }
    rows.push(
      row('2026-01-01', 'AAAA.JK', 85, 500),
      row('2026-01-02', 'AAAA.JK', 85, 505),
      row('2026-01-03', 'AAAA.JK', 85, 100),
      row('2026-01-21', 'AAAA.JK', 85, 110),
    );
    const result = await calculateCalibrationObservations(rows, provider({
      'AAAA.JK': { '2026-01-02': 505 },
    }));

    expect(result.observations[0]?.returnT20).toBeNull();
    expect(result.observations[0]?.exitDateT20).toBeNull();
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

  it('mendekorelasi observasi per ticker per 20 hari bursa sebelum klaim validasi', () => {
    const observations: CalibrationObservation[] = Array.from({ length: 45 }, (_, i) => ({
      ticker: 'AAAA.JK',
      signalDate: `2026-01-${String(i + 1).padStart(2, '0')}`,
      entryDate: `2026-01-${String(i + 2).padStart(2, '0')}`,
      exitDateT20: null,
      lensScore: 85,
      bucket: '80-100',
      marketCap: null,
      returnT5: 1,
      returnT20: 1,
    }));

    expect(decorrelateCalibrationObservations(observations)).toHaveLength(3);
  });

  // FASE 0 - C-5: 31 ambang diuji pada satu himpunan data yang sama, tanpa holdout dan
  // tanpa koreksi pengujian berganda. Selama itu belum ada, rekomendasi ambang otomatis
  // dibekukan - termasuk jalur yang mengirimkannya ke AI untuk dikalimatkan.
  it('rekomendasi ambang dibekukan: tidak menyentuh database maupun provider sama sekali', async () => {
    const db = {
      query: async () => {
        throw new Error('Database tidak boleh disentuh saat threshold recommender dibekukan');
      },
    };
    const provider = {
      getDailyOpenBars: async () => {
        throw new Error('Provider tidak boleh disentuh saat threshold recommender dibekukan');
      },
    };

    const result = await recommendCalibrationThreshold(db, provider);

    expect(result.threshold).toBeNull();
    expect(result.aiGenerated).toBe(false);
    expect(result.frozen).toBe(true);
    expect(result.text.toLowerCase()).toContain('out-of-sample');
  });

  // FASE 1 - dataset campuran versi scoring tidak boleh diagregasi menjadi satu deret.
  it('menolak baris dengan score_version berbeda dan baris tanpa versi', async () => {
    const rows: LensRadarHistoryEntry[] = [];
    const opens: Record<string, Record<string, number>> = { 'AAAA.JK': {}, 'BBBB.JK': {} };
    for (let i = 1; i <= 21; i++) {
      const date = `2026-01-${String(i).padStart(2, '0')}`;
      rows.push({ ...row(date, 'AAAA.JK', 85, 100 + i), score_version: 'lens-score-v1.3.0' });
      rows.push({ ...row(date, 'BBBB.JK', 85, 100 + i), score_version: 'lens-score-v1.2.0' });
      opens['AAAA.JK'][date] = 100;
      opens['BBBB.JK'][date] = 100;
    }

    const result = await calculateCalibrationObservations(rows, provider(opens));

    expect(result.scoreVersion).toBe('lens-score-v1.3.0');
    expect(result.rejectedRows).toBe(21);
    expect(result.observations.every((obs) => obs.ticker === 'AAAA.JK')).toBe(true);
  });

  it('FAIL-CLOSED: seluruh baris tanpa score_version menghasilkan nol observasi', async () => {
    const rows: LensRadarHistoryEntry[] = [];
    const opens: Record<string, Record<string, number>> = { 'AAAA.JK': {} };
    for (let i = 1; i <= 21; i++) {
      const date = `2026-01-${String(i).padStart(2, '0')}`;
      rows.push({ ...row(date, 'AAAA.JK', 85, 100 + i), score_version: null });
      opens['AAAA.JK'][date] = 100;
    }

    const result = await calculateCalibrationObservations(rows, provider(opens));

    expect(result.scoreVersion).toBeNull();
    expect(result.observations).toHaveLength(0);
    expect(result.rejectedRows).toBe(21);
  });
});
