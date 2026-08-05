import { describe, it, expect } from 'vitest';
import { computeFundamentalQuality, computeValuationLabel } from '../consensus-labels.service';

describe('computeFundamentalQuality', () => {
  it('BAGUS kalau >=60% vote yang punya data bullish', () => {
    expect(computeFundamentalQuality(7, 2)).toEqual({ label: 'BAGUS', pct: 78 });
  });

  it('BURUK kalau <=40% vote yang punya data bullish', () => {
    expect(computeFundamentalQuality(2, 7)).toEqual({ label: 'BURUK', pct: 78 });
  });

  it('NETRAL kalau di antara 40-60%', () => {
    expect(computeFundamentalQuality(5, 5)).toEqual({ label: 'NETRAL', pct: 50 });
  });

  it('NETRAL pct 0 kalau tidak ada satu pun analyzer yang punya data', () => {
    expect(computeFundamentalQuality(0, 0)).toEqual({ label: 'NETRAL', pct: 0 });
  });
});

describe('computeValuationLabel', () => {
  // Kasus produksi sesungguhnya: KOTA.JK, fair_value ~50.7, mos -252.9 (harga 179 jauh di
  // atas nilai wajar). SEBELUM fix ini, /fundamental malah bilang "UNDERVALUED" untuk
  // saham yang sama - lihat catatan panjang di consensus-labels.service.ts.
  it('OVERVALUED untuk kasus KOTA.JK (mos negatif besar)', () => {
    expect(computeValuationLabel(-252.94669715808578, 50.71587337161719)).toBe('OVERVALUED (MOS -253%)');
  });

  it('UNDERVALUED kalau mos positif (fair value di atas harga)', () => {
    expect(computeValuationLabel(25, 1000)).toBe('UNDERVALUED (MOS +25%)');
  });

  it('FAIR VALUE kalau mos persis 0', () => {
    expect(computeValuationLabel(0, 1000)).toBe('FAIR VALUE (MOS 0%)');
  });

  it('DATA TIDAK CUKUP kalau fair value tidak berhasil dihitung (0)', () => {
    expect(computeValuationLabel(0, 0)).toBe('DATA TIDAK CUKUP');
  });

  it('DATA TIDAK CUKUP kalau fair value negatif (tidak masuk akal, bukan sinyal murah)', () => {
    expect(computeValuationLabel(150, -10)).toBe('DATA TIDAK CUKUP');
  });
});
