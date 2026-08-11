import { describe, expect, it } from 'vitest';
import { simulateTrade } from '../tpcl-validation.service';
import { DEFAULT_TRADING_SETUP_PARAMETERS } from '../trading-setup';
import type { SelectedPriceBar } from '@/shared/market/price-basis';

// REGRESI H-07 (audit kuantitatif 2026-08-11): bar harian yang menyentuh TP1 DAN SL punya
// dua hasil yang sama-sama mungkin, karena daily OHLC tidak menyimpan urutan intraday.
// Produksi memilih SL (konservatif) - itu benar. Yang hilang dulu adalah UKURANNYA: tanpa
// menghitung berapa banyak trade yang hasilnya ditentukan asumsi ini, tidak ada yang tahu
// apakah 2% atau 40% kesimpulan lab bergantung pada tie-break.

const params = { id: 'TEST', label: 'test', baseline: true, ...DEFAULT_TRADING_SETUP_PARAMETERS };

function bar(date: string, open: number, high: number, low: number, close: number): SelectedPriceBar {
  return {
    date, ticker: 'TEST.JK', basis: 'RAW', open, high, low, close,
    source: 'TEST', adjustmentVersion: 'test', corporateActionStatus: 'NONE',
  };
}

/** Deret bergelombang cukup panjang untuk ATR + swing level, diakhiri bar yang
 * ditentukan pemanggil. */
function series(tail: SelectedPriceBar[]): SelectedPriceBar[] {
  const bars: SelectedPriceBar[] = [];
  for (let i = 0; i < 80; i++) {
    const base = 1000 + Math.sin((i / 10) * 2 * Math.PI) * 8;
    bars.push(bar(`2026-01-${String(i + 1).padStart(2, '0')}`, base - 1, base + 4, base - 4, base));
  }
  return [...bars, ...tail];
}

function run(tailBar: SelectedPriceBar, rule: 'SL_FIRST' | 'TP_FIRST') {
  // signalIndex = bar terakhir dari deret dasar; entry di bar berikutnya.
  const bars = series([
    bar('2026-04-01', 1000, 1004, 996, 1000),   // bar entry
    tailBar,                                     // bar uji
    ...Array.from({ length: 25 }, (_, i) =>
      bar(`2026-05-${String(i + 1).padStart(2, '0')}`, 1000, 1004, 996, 1000)),
  ]);
  return simulateTrade(bars, 79, params, 'TRAIN', 'SIDEWAYS', 'TEST.JK', rule);
}

describe('H-07 - bar yang menyentuh TP dan SL sekaligus', () => {
  // Rentang sangat lebar: menembus stop DAN mencapai target pada bar yang sama.
  const barAmbigu = bar('2026-04-02', 1000, 2000, 1, 1500);

  it('SL_FIRST (produksi) menyelesaikannya sebagai SL dan MENANDAINYA ambigu', () => {
    const hasil = run(barAmbigu, 'SL_FIRST');
    expect(hasil).not.toBeNull();
    expect(hasil!.outcome).toBe('SL');
    expect(hasil!.ambiguousBar).toBe(true);
  });

  it('TP_FIRST (skenario tandingan) menyelesaikannya sebagai TP1, tetap ditandai ambigu', () => {
    const hasil = run(barAmbigu, 'TP_FIRST');
    expect(hasil).not.toBeNull();
    expect(hasil!.outcome).toBe('TP1');
    expect(hasil!.ambiguousBar).toBe(true);
  });

  it('aturan tie-break MENGUBAH hasil - itu sebabnya porsinya harus dilaporkan', () => {
    const konservatif = run(barAmbigu, 'SL_FIRST')!;
    const optimistis = run(barAmbigu, 'TP_FIRST')!;
    expect(konservatif.outcome).not.toBe(optimistis.outcome);
    expect(optimistis.netReturnPct).toBeGreaterThan(konservatif.netReturnPct);
  });

  it('bar yang HANYA menembus stop tidak ditandai ambigu, dan aturannya tidak berpengaruh', () => {
    const barSlSaja = bar('2026-04-02', 1000, 1005, 1, 500);
    const konservatif = run(barSlSaja, 'SL_FIRST')!;
    const optimistis = run(barSlSaja, 'TP_FIRST')!;
    expect(konservatif.ambiguousBar).toBe(false);
    expect(konservatif.outcome).toBe('SL');
    expect(optimistis.outcome).toBe('SL');
  });

  it('bar yang HANYA mencapai target tidak ditandai ambigu', () => {
    const barTpSaja = bar('2026-04-02', 1000, 2000, 999, 1900);
    const hasil = run(barTpSaja, 'SL_FIRST')!;
    expect(hasil.ambiguousBar).toBe(false);
    expect(hasil.outcome).toBe('TP1');
  });
});
