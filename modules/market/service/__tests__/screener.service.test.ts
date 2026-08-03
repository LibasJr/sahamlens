import { describe, it, expect } from 'vitest';
import { atr14Pct, filterCurated } from '../screener.service';

/** Bar dengan range harian tetap `range` dan close tetap `close`.
 * True Range tiap hari = max(high-low, |high-prevClose|, |low-prevClose|) = range,
 * karena prevClose selalu sama dengan close hari ini. Jadi ATR = range. */
function flatBars(count: number, close: number, range: number) {
  return Array.from({ length: count }, () => ({
    high: close + range / 2,
    low: close - range / 2,
    close,
  }));
}

describe('atr14Pct', () => {
  it('menghitung ATR sebagai persen dari harga terakhir', () => {
    // range 40 pada harga 1000 -> ATR 40 -> 4% dari harga
    const bars = flatBars(20, 1000, 40);

    expect(atr14Pct(bars)).toBeCloseTo(4, 1);
  });

  it('mengembalikan null kalau bar kurang dari 15', () => {
    expect(atr14Pct(flatBars(14, 1000, 40))).toBeNull();
  });

  it('mengembalikan null untuk array kosong, bukan melempar error', () => {
    expect(atr14Pct([])).toBeNull();
  });

  it('mengembalikan null kalau harga terakhir nol - tidak membagi nol', () => {
    expect(atr14Pct(flatBars(20, 0, 10))).toBeNull();
  });
});

describe('filterCurated', () => {
  it('membuang saham yang tidak lolos standar kualitas', () => {
    const stocks = [
      { ticker: 'BBCA' }, { ticker: 'GOTO' }, { ticker: 'BUKA' },
      { ticker: 'MEGA' }, { ticker: 'BYAN' }, { ticker: 'SILO' },
    ];

    expect(filterCurated(stocks).map((s) => s.ticker)).toEqual(['BBCA']);
  });

  it('mempertahankan saham yang ada di daftar tersaring', () => {
    const stocks = [{ ticker: 'BBCA' }, { ticker: 'TLKM' }, { ticker: 'ANTM' }];

    expect(filterCurated(stocks)).toHaveLength(3);
  });

  it('mencocokkan ticker tanpa akhiran .JK - RawStock menyimpannya sudah dibuang', () => {
    expect(filterCurated([{ ticker: 'BBCA' }])).toHaveLength(1);
    expect(filterCurated([{ ticker: 'BBCA.JK' }])).toHaveLength(1);
  });

  it('array kosong menghasilkan array kosong, bukan error', () => {
    expect(filterCurated([])).toEqual([]);
  });
});
