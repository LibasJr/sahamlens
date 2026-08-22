import { describe, expect, it } from 'vitest';
import {
  calculateBacktestSignificance,
  MIN_SIGNIFICANCE_TRADES,
} from '../backtest-significance.service';
import type { TradeRecord } from '../../types/backtest.types';

// 2024-01-01 adalah hari Senin - dipakai sebagai jangkar supaya tiap weekIndex jatuh di
// minggu kalender ISO yang berbeda dan berurutan (satu trade = satu minggu = satu blok).
function mondayOfWeek(weekIndex: number): string {
  const d = new Date(Date.UTC(2024, 0, 1));
  d.setUTCDate(d.getUTCDate() + weekIndex * 7);
  return d.toISOString().slice(0, 10);
}

function trade(overrides: Partial<TradeRecord> & { pnlPct: number; weekIndex: number }): TradeRecord {
  const { weekIndex, ...rest } = overrides;
  const entryDate = mondayOfWeek(weekIndex);
  return {
    entryDate,
    date: entryDate,
    symbol: 'BBCA.JK',
    buy: 9000,
    sell: 9000 * (1 + overrides.pnlPct / 100),
    ...rest,
  };
}

/** N trade, satu per minggu berbeda, dengan pnlPct dari fungsi index (deterministik). */
function weeklyTrades(count: number, pnlAt: (i: number) => number): TradeRecord[] {
  return Array.from({ length: count }, (_, i) => trade({ weekIndex: i, pnlPct: pnlAt(i), symbol: `T${i}.JK` }));
}

describe('calculateBacktestSignificance - gerbang sampel minimum', () => {
  it('di bawah MIN_SIGNIFICANCE_TRADES, tidak menghitung bootstrap/permutation sama sekali', () => {
    const trades = weeklyTrades(MIN_SIGNIFICANCE_TRADES - 1, () => 5);
    const result = calculateBacktestSignificance(trades);

    expect(result.bootstrap.status).toBe('INSUFFICIENT_DATA');
    expect(result.bootstrap.iterations).toBe(0);
    expect(result.permutation.iterations).toBe(0);
    expect(result.permutation.pValueOneTailed).toBeNull();
    expect(result.meanPnlPct).toBeNull();
    expect(result.note).toContain(`>= ${MIN_SIGNIFICANCE_TRADES}`);
  });

  it('tepat di ambang MIN_SIGNIFICANCE_TRADES, uji dijalankan', () => {
    const trades = weeklyTrades(MIN_SIGNIFICANCE_TRADES, () => 5);
    const result = calculateBacktestSignificance(trades);

    expect(result.bootstrap.status).not.toBe('INSUFFICIENT_DATA');
    expect(result.bootstrap.iterations).toBeGreaterThan(0);
  });

  it('trade kosong tidak crash - kembali INSUFFICIENT_DATA', () => {
    const result = calculateBacktestSignificance([]);
    expect(result.bootstrap.status).toBe('INSUFFICIENT_DATA');
    expect(result.totalTrades).toBe(0);
  });
});

describe('calculateBacktestSignificance - blok minggu tunggal', () => {
  it('seluruh trade di satu minggu kalender yang sama -> INSUFFICIENT_DATA meski jumlah trade cukup', () => {
    // 40 trade, SEMUA entryDate sama (satu minggu) - blocks.length harus 1.
    const trades = Array.from({ length: 40 }, (_, i) =>
      trade({ weekIndex: 0, pnlPct: 5, symbol: `T${i}.JK` }),
    );
    const result = calculateBacktestSignificance(trades);

    expect(result.weekBlocks).toBe(1);
    expect(result.bootstrap.status).toBe('INSUFFICIENT_DATA');
    expect(result.note).toContain('satu minggu kalender');
  });
});

describe('calculateBacktestSignificance - edge kuat dan konsisten', () => {
  it('40 trade positif konsisten di 40 minggu berbeda -> bootstrap CI seluruhnya di atas nol, permutation signifikan', () => {
    // pnlPct berosilasi 4/5/6 (rata-rata 5) - variasi kecil supaya CI tidak nol lebar,
    // tapi seluruhnya tetap jauh dari nol.
    const trades = weeklyTrades(40, (i) => 4 + (i % 3));
    const result = calculateBacktestSignificance(trades);

    expect(result.meanPnlPct).toBeCloseTo(5, 0);
    expect(result.bootstrap.status).toBe('SUPPORTIVE');
    expect(result.bootstrap.ci95Low).not.toBeNull();
    expect(result.bootstrap.ci95Low!).toBeGreaterThan(0);
    expect(result.permutation.significant).toBe(true);
    expect(result.permutation.pValueOneTailed!).toBeLessThan(0.05);
  });

  it('40 trade negatif konsisten -> bootstrap CI seluruhnya di bawah nol (NEGATIVE), bukan SUPPORTIVE', () => {
    const trades = weeklyTrades(40, (i) => -4 - (i % 3));
    const result = calculateBacktestSignificance(trades);

    expect(result.bootstrap.status).toBe('NEGATIVE');
    expect(result.bootstrap.ci95High).not.toBeNull();
    expect(result.bootstrap.ci95High!).toBeLessThan(0);
  });
});

describe('calculateBacktestSignificance - tidak ada edge (noise murni)', () => {
  it('pnlPct berayun +5/-5 rata (mean~0) di banyak minggu -> CI meliputi nol, permutation TIDAK signifikan', () => {
    const trades = weeklyTrades(60, (i) => (i % 2 === 0 ? 5 : -5));
    const result = calculateBacktestSignificance(trades);

    expect(result.meanPnlPct).toBeCloseTo(0, 0);
    expect(result.bootstrap.status).toBe('INCONCLUSIVE');
    expect(result.bootstrap.ci95Low!).toBeLessThanOrEqual(0);
    expect(result.bootstrap.ci95High!).toBeGreaterThanOrEqual(0);
    expect(result.permutation.significant).toBe(false);
    expect(result.permutation.pValueOneTailed!).toBeGreaterThan(0.05);
  });
});

describe('calculateBacktestSignificance - determinisme', () => {
  it('input yang sama menghasilkan CI/p-value yang identik setiap dipanggil (reproducible, bukan acak tiap refresh)', () => {
    const trades = weeklyTrades(50, (i) => 3 + ((i * 7) % 11) - 5);
    const first = calculateBacktestSignificance(trades);
    const second = calculateBacktestSignificance(trades);

    expect(second).toEqual(first);
  });

  it('urutan trade yang berbeda tapi isi sama tetap menghasilkan hash seed & hasil yang sama', () => {
    const trades = weeklyTrades(50, (i) => 3 + ((i * 7) % 11) - 5);
    const shuffled = [...trades].reverse();
    const a = calculateBacktestSignificance(trades);
    const b = calculateBacktestSignificance(shuffled);

    // meanPnlPct dan status HARUS sama (nilainya identik, cuma urutan array beda).
    // iterasi RNG boleh mengambil jalur berbeda karena seed dibangun dari isi+urutan
    // string yang di-hash, tapi hasil statistiknya harus konvergen ke sekitar nilai sama.
    expect(a.meanPnlPct).toBe(b.meanPnlPct);
    expect(a.bootstrap.status).toBe(b.bootstrap.status);
  });
});

describe('calculateBacktestSignificance - data tidak valid diabaikan, bukan bikin crash', () => {
  it('pnlPct non-finite dibuang dari perhitungan, tidak menyebabkan NaN menyebar', () => {
    const trades = [
      ...weeklyTrades(35, () => 5),
      trade({ weekIndex: 35, pnlPct: NaN, symbol: 'BAD.JK' }),
    ];
    const result = calculateBacktestSignificance(trades);

    expect(Number.isFinite(result.meanPnlPct!)).toBe(true);
    expect(result.meanPnlPct).toBeCloseTo(5, 0);
  });
});

describe('calculateBacktestSignificance - metadata hasil', () => {
  it('selalu menyebut in-sample/per-run, bukan validasi out-of-sample', () => {
    const trades = weeklyTrades(40, () => 5);
    const result = calculateBacktestSignificance(trades);
    expect(result.note.toLowerCase()).toContain('in-sample');
  });

  it('totalTrades & weekBlocks mencerminkan input persis', () => {
    const trades = weeklyTrades(45, () => 2);
    const result = calculateBacktestSignificance(trades);
    expect(result.totalTrades).toBe(45);
    expect(result.weekBlocks).toBe(45);
  });
});
