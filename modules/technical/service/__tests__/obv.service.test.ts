import { describe, expect, it } from 'vitest';
import { calculateObvSeries, obvSlope, type ObvBar } from '../obv';

describe('calculateObvSeries - GOLDEN (definisi Granville, diverifikasi tangan)', () => {
  it('deret 5 bar naik-turun-flat-naik -> OBV kumulatif sesuai definisi', () => {
    const bars: ObvBar[] = [
      { adjClose: 100, volume: 1000 },
      { adjClose: 102, volume: 1500 }, // naik -> +1500
      { adjClose: 101, volume: 800 },  // turun -> -800
      { adjClose: 101, volume: 500 },  // flat -> tetap
      { adjClose: 105, volume: 2000 }, // naik -> +2000
    ];
    // OBV[0]=0, lalu 0+1500=1500, 1500-800=700, 700 (flat), 700+2000=2700.
    expect(calculateObvSeries(bars)).toEqual([0, 1500, 700, 700, 2700]);
  });

  it('array kosong -> null, bukan crash', () => {
    expect(calculateObvSeries([])).toBeNull();
  });

  it('satu bar -> [0] (tidak ada bar sebelumnya untuk dibandingkan)', () => {
    expect(calculateObvSeries([{ adjClose: 100, volume: 500 }])).toEqual([0]);
  });

  it('seluruh deret naik monoton -> OBV = kumulatif volume penuh (semua ikut ditambahkan)', () => {
    const bars: ObvBar[] = Array.from({ length: 10 }, (_, i) => ({ adjClose: 100 + i, volume: 100 }));
    const series = calculateObvSeries(bars)!;
    expect(series[series.length - 1]).toBe(900); // 9 kenaikan x 100
  });

  it('seluruh deret turun monoton -> OBV negatif, besarnya sama dengan total volume', () => {
    const bars: ObvBar[] = Array.from({ length: 10 }, (_, i) => ({ adjClose: 100 - i, volume: 100 }));
    const series = calculateObvSeries(bars)!;
    expect(series[series.length - 1]).toBe(-900);
  });
});

// FAIL-CLOSED. OBV menjumlahkan volume secara KUMULATIF, jadi satu volume hilang yang
// diperlakukan sebagai 0 akan menggeser seluruh deret sesudahnya secara permanen -
// sementara garisnya tetap tampil mulus dan meyakinkan. Ini taruhan terbesar di antara
// seluruh indikator baru, karena kesalahannya tidak meninggalkan jejak visual apa pun.
describe('calculateObvSeries - menolak data cacat, tidak mengarang nol', () => {
  it('satu volume hilang (undefined) -> null untuk SELURUH deret', () => {
    const bars = [
      { adjClose: 100, volume: 1000 },
      { adjClose: 102, volume: undefined as unknown as number },
      { adjClose: 105, volume: 2000 },
    ];
    expect(calculateObvSeries(bars)).toBeNull();
  });

  it('satu volume NaN -> null (bukan diam-diam dianggap 0)', () => {
    const bars: ObvBar[] = [
      { adjClose: 100, volume: 1000 },
      { adjClose: 102, volume: NaN },
      { adjClose: 105, volume: 2000 },
    ];
    expect(calculateObvSeries(bars)).toBeNull();
  });

  it('satu adjClose tidak terhingga -> null (arah naik/turun tidak dapat ditentukan)', () => {
    const bars: ObvBar[] = [
      { adjClose: 100, volume: 1000 },
      { adjClose: Infinity, volume: 1500 },
      { adjClose: 105, volume: 2000 },
    ];
    expect(calculateObvSeries(bars)).toBeNull();
  });

  it('volume 0 yang SUNGGUHAN (hari tanpa transaksi) tetap dihitung, bukan ditolak', () => {
    // Pembeda penting: 0 sebagai hasil pengukuran nyata itu SAH; yang ditolak adalah
    // volume yang tidak ada datanya. Keduanya tidak boleh tertukar.
    const bars: ObvBar[] = [
      { adjClose: 100, volume: 1000 },
      { adjClose: 102, volume: 0 },
      { adjClose: 105, volume: 2000 },
    ];
    expect(calculateObvSeries(bars)).toEqual([0, 0, 2000]);
  });
});

describe('obvSlope', () => {
  it('slope positif kalau OBV naik dalam lookback window (akumulasi)', () => {
    const series = [0, 100, 200, 300, 400, 500];
    expect(obvSlope(series, 5)).toBe(500);
  });

  it('slope negatif kalau OBV turun', () => {
    const series = [1000, 800, 600, 400, 200, 0];
    expect(obvSlope(series, 5)).toBe(-1000);
  });

  it('deret lebih pendek dari lookback + 1 -> null', () => {
    expect(obvSlope([0, 100, 200], 10)).toBeNull();
  });
});
