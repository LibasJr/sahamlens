import { describe, it, expect } from 'vitest';
import { analyzeOfficialForeignFlow } from '../idx-foreign-flow.service';
import type { IdxForeignFlowPoint } from '../idx-foreign-flow.service';

// Penjaga jalur pengganti CMF.
//
// Sampai 2026-08-18 tekanan arus dana ditebak dari posisi close di dalam range harian
// (Chaikin Money Flow) karena ForeignBuy/ForeignSell per emiten memang belum ada. Sekarang
// angkanya nyata, dan yang diuji di sini adalah bahwa penggantinya benar-benar membaca
// transaksi asing - bukan diam-diam mengembalikan angka tengah saat datanya cacat.

function titik(date: string, foreignBuy: number, foreignSell: number, close = 1000): IdxForeignFlowPoint {
  const netForeignVolume = foreignBuy - foreignSell;
  return {
    date,
    close,
    volume: (foreignBuy + foreignSell) * 2,
    foreignBuy,
    foreignSell,
    netForeignVolume,
    netForeignValueBillion: (netForeignVolume * close) / 1_000_000_000,
  };
}

/** N hari dengan pola beli/jual tetap, tanggal berurutan. */
function deret(n: number, buy: number, sell: number): IdxForeignFlowPoint[] {
  return Array.from({ length: n }, (_, i) => titik(`2026-08-${String(i + 1).padStart(2, '0')}`, buy, sell));
}

describe('analyzeOfficialForeignFlow', () => {
  it('mengembalikan UNAVAILABLE untuk histori kosong, bukan nilai tengah', () => {
    const hasil = analyzeOfficialForeignFlow([]);
    expect(hasil.status).toBe('UNAVAILABLE');
    expect(hasil.netPressure20).toBeNull();
    expect(hasil.accumulationStatus).toBeNull();
    expect(hasil.observedDays).toBe(0);
  });

  it('tidak mengarang tekanan saat tidak ada transaksi asing sama sekali', () => {
    // Emiten sepi: asing tidak bertransaksi. Penyebutnya nol - itu KETIADAAN data,
    // bukan "seimbang".
    const hasil = analyzeOfficialForeignFlow(deret(20, 0, 0));
    expect(hasil.netPressure20).toBeNull();
    expect(hasil.status).toBe('UNAVAILABLE');
    expect(hasil.observedDays).toBe(20);
  });

  it('menghitung tekanan beli dari lembar saham asing yang sungguhan', () => {
    // Tiap hari asing beli 900 juta, jual 100 juta -> net 800/1000 = +80%.
    const hasil = analyzeOfficialForeignFlow(deret(20, 900, 100));
    expect(hasil.netPressure20).toBeCloseTo(80, 1);
    expect(hasil.status).toBe('BULLISH');
    expect(hasil.accumulationStatus).toBe('AKUMULASI');
    expect(hasil.consecutiveBuyDays).toBe(20);
    expect(hasil.consecutiveSellDays).toBe(0);
    expect(hasil.positiveRatio20).toBe(1);
  });

  it('menghitung tekanan jual dengan tanda yang benar', () => {
    const hasil = analyzeOfficialForeignFlow(deret(20, 100, 900));
    expect(hasil.netPressure20).toBeCloseTo(-80, 1);
    expect(hasil.status).toBe('BEARISH');
    expect(hasil.accumulationStatus).toBe('DISTRIBUSI');
    expect(hasil.consecutiveSellDays).toBe(20);
    expect(hasil.net5DBillion).toBeLessThan(0);
  });

  it('satu hari berlawanan arah tidak boleh membalik label 20 hari sendirian', () => {
    // 19 hari net beli kuat, hari terakhir net jual tipis. Besaran 20 hari masih sangat
    // positif, tapi arah hari terakhir negatif - label tidak boleh BULLISH.
    const history = [...deret(19, 900, 100), titik('2026-08-20', 100, 200)];
    const hasil = analyzeOfficialForeignFlow(history);
    expect(hasil.netPressure20).toBeGreaterThan(20);
    expect(hasil.netPressureToday).toBeLessThan(0);
    expect(hasil.status).toBe('NEUTRAL');
    expect(hasil.consecutiveBuyDays).toBe(0);
    expect(hasil.consecutiveSellDays).toBe(1);
  });

  it('hanya memakai 20 hari terakhir walau histori jauh lebih panjang', () => {
    // 60 hari jual berat lalu 20 hari beli berat: jendelanya harus melaporkan yang beli.
    const history = [...deret(60, 100, 900), ...deret(20, 900, 100)];
    const hasil = analyzeOfficialForeignFlow(history);
    expect(hasil.observedDays).toBe(20);
    expect(hasil.netPressure20).toBeCloseTo(80, 1);
  });

  it('melaporkan jendela yang belum penuh apa adanya', () => {
    const hasil = analyzeOfficialForeignFlow(deret(6, 700, 300));
    expect(hasil.observedDays).toBe(6);
    expect(hasil.netPressure20).toBeCloseTo(40, 1);
  });
});
