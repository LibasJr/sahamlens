import { describe, expect, it } from 'vitest';
import { ATR_PERIOD, calculateWilderAtr, wilderAtrAt } from '../atr';
import { analyze as analyzeVolatility } from '../analyzers/volatility-analyzer';
import { buildLongTradingSetup, STRUCTURE_LOOKBACK_BARS } from '@/modules/recommendation/service/trading-setup';
import { findStructuralZones } from '../analyzers/swing-levels';
import {
  calculateATR as calculateSuiteAtr,
  calculatePivotPoints,
  calculateTradingPlan,
  type OHLCVCandle,
} from '@/lib/technical/technical-levels';

// GOLDEN TEST + INVARIAN LINTAS-JALUR untuk ATR (temuan C-01 audit kuantitatif 2026-08-11).
//
// Kenapa file ini ada: selama berbulan-bulan produksi menghitung ATR sebagai rata-rata
// aritmatik 14 True Range terakhir sementara TP/CL Validation Lab memakai Wilder, dan
// TIDAK ADA SATU PUN test yang bisa menangkapnya - test yang ada hanya memeriksa invariant
// (ATR >= 0, panjang array cocok, warm-up menghasilkan null). Invariant seperti itu lulus
// untuk KEDUA formula. Yang dibutuhkan adalah dua hal yang ada di bawah:
//
//   1. nilai referensi tetap (golden), supaya perubahan formula tidak senyap;
//   2. perbandingan LINTAS JALUR, supaya produksi dan lab tidak bisa berbeda lagi.

// Deret uji: 24 True Range, semuanya 4 kecuali SATU lonjakan 42.
// Sengaja dibuat supaya hasilnya bisa diturunkan tangan (lihat komentar nilai harapan).
function seriesWithSpike() {
  const bars: { high: number; low: number; close: number }[] = [];
  for (let i = 0; i < 20; i++) {
    const base = 100 + i;              // naik 1/bar, range 4 -> TR selalu 4
    bars.push({ high: base + 2, low: base - 2, close: base });
  }
  bars.push({ high: 160, low: 118, close: 158 });   // lonjakan: TR = 42
  for (let i = 0; i < 4; i++) {
    const base = 158 + i;
    bars.push({ high: base + 2, low: base - 2, close: base });
  }
  return bars;
}

/** Rata-rata aritmatik 14 TR terakhir - FORMULA LAMA produksi. Ada di sini HANYA sebagai
 * pembanding negatif: kalau suatu hari produksi kembali ke bentuk ini, test di bawah
 * gagal alih-alih lolos diam-diam. */
function simpleMeanAtr(bars: { high: number; low: number; close: number }[], period = ATR_PERIOD) {
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    sum += Math.max(
      bars[i]!.high - bars[i]!.low,
      Math.abs(bars[i]!.high - bars[i - 1]!.close),
      Math.abs(bars[i]!.low - bars[i - 1]!.close)
    );
  }
  return sum / period;
}

describe('calculateWilderAtr - golden value', () => {
  it('cocok dengan nilai Wilder yang diturunkan tangan', () => {
    // Seed  = rata-rata 14 TR pertama = 4 (semuanya 4).
    // Lonjakan: (4 x 13 + 42) / 14                     = 6.714285714285714
    // 4 bar TR=4 berikutnya, masing-masing (a x 13 + 4)/14:
    //   6.520408163265306 -> 6.340379008746355 -> 6.173209079550187 -> 6.017979859582316
    expect(calculateWilderAtr(seriesWithSpike())).toBeCloseTo(6.01797986, 6);
  });

  it('deret dengan TR konstan menghasilkan ATR = TR itu sendiri', () => {
    const flat = Array.from({ length: 30 }, (_, i) => ({
      high: 100 + i + 2, low: 100 + i - 2, close: 100 + i,
    }));
    expect(calculateWilderAtr(flat)).toBeCloseTo(4, 10);
  });

  it('BUKAN rata-rata aritmatik 14 TR terakhir - dua formula ini harus berbeda', () => {
    const bars = seriesWithSpike();
    // Kalau assertion ini suatu hari gagal karena keduanya jadi sama, berarti ada yang
    // mengganti Wilder kembali menjadi rata-rata sederhana.
    expect(simpleMeanAtr(bars)).not.toBeCloseTo(calculateWilderAtr(bars)!, 4);
    expect(simpleMeanAtr(bars)).toBeCloseTo(6.714285714, 6);
  });

  it('bar kurang dari period + 1 menghasilkan null, bukan angka setengah jadi', () => {
    const bars = seriesWithSpike().slice(0, ATR_PERIOD);
    expect(calculateWilderAtr(bars)).toBeNull();
    expect(calculateWilderAtr([])).toBeNull();
  });

  it('wilderAtrAt(index) identik dengan menghitung ulang atas potongan 0..index', () => {
    const bars = seriesWithSpike();
    for (const index of [14, 18, 20, bars.length - 1]) {
      expect(wilderAtrAt(bars, index)).toBe(calculateWilderAtr(bars.slice(0, index + 1)));
    }
    // Bar setelah `index` TIDAK boleh mempengaruhi hasilnya (look-ahead).
    const dipotong = bars.slice(0, 21);
    expect(wilderAtrAt(bars, 20)).toBe(wilderAtrAt(dipotong, 20));
  });
});

describe('INVARIAN C-01 - satu ATR untuk produksi dan TP/CL Lab', () => {
  const bars = seriesWithSpike();
  const historyProduksi = bars.map((b) => ({ High: b.high, Low: b.low, Close: b.close }));

  it('analyzer volatilitas (jalur produksi) memakai Wilder yang sama, bukan rata-rata sederhana', () => {
    const raw = analyzeVolatility(historyProduksi, bars[bars.length - 1]!.close).raw.atr;
    expect(raw).toBeCloseTo(calculateWilderAtr(bars)!, 10);
    expect(raw).not.toBeCloseTo(simpleMeanAtr(bars), 4);
  });

  it('ATR yang dipakai lab (wilderAtrAt di bar terakhir) sama dengan ATR produksi', () => {
    const produksi = analyzeVolatility(historyProduksi, bars[bars.length - 1]!.close).raw.atr!;
    const lab = wilderAtrAt(bars, bars.length - 1)!;
    expect(produksi).toBeCloseTo(lab, 10);
  });

  // Jalur ketiga, ditemukan 23 Agustus 2026 - dua tahun setelah C-01 dinyatakan ditutup.
  // `lib/technical/technical-levels.ts` menyimpan salinan rata-rata sederhananya sendiri
  // dan tidak pernah ikut dikoreksi, padahal dari sanalah TP/CL kartu ekspor teknikal dan
  // menu Teknikal berasal. Yang membongkarnya adalah kartu itu sendiri: ia mencetak ATR
  // versi trading plan DAN ATR versi volatility-analyzer di satu halaman, dan keduanya
  // berbeda 15% pada BBCA.
  it('suite teknikal (sumber TP/CL kartu & menu Teknikal) memakai Wilder yang sama', () => {
    const candles: OHLCVCandle[] = bars.map((b, i) => ({
      time: `2026-01-${String(i + 1).padStart(2, '0')}`,
      open: b.close,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: 1000,
    }));

    const suiteAtr = calculateSuiteAtr(candles)!;
    expect(suiteAtr).toBeCloseTo(calculateWilderAtr(bars)!, 10);
    expect(suiteAtr).not.toBeCloseTo(simpleMeanAtr(bars), 4);

    // Bukan cuma helper-nya: angka yang benar-benar dicetak di kartu adalah
    // `tradingPlan.atr14`, dan itu yang menentukan stop loss serta target harga.
    const last = candles.at(-1)!;
    const plan = calculateTradingPlan(candles, calculatePivotPoints(last.high, last.low, last.close));
    expect(plan).not.toBeNull();
    expect(plan!.atr14).toBe(Math.round(calculateWilderAtr(bars)!));
    expect(plan!.atr14).not.toBe(Math.round(simpleMeanAtr(bars)));
  });
});

describe('INVARIAN C-01 - jendela struktur sama di produksi dan TP/CL Lab', () => {
  // Deret gelombang 240 bar yang menghasilkan setup long VALID (bukan null) - kalau
  // setup-nya null, seluruh perbandingan di bawah cuma membandingkan null dengan null
  // dan tidak membuktikan apa pun. Parameter di bawah dipilih dengan menjalankan
  // buildLongTradingSetup() atas ratusan bentuk deret dan mengambil yang lolos gerbang
  // RR minimum-nya.
  function longSeries() {
    const bars: { High: number; Low: number; Close: number }[] = [];
    for (let i = 0; i < 240; i++) {
      const base = 1000 + Math.sin((i / 10) * 2 * Math.PI) * 8;
      bars.push({ High: base + 4, Low: base - 4, Close: base });
    }
    return bars;
  }

  const atrOf = (bars: { High: number; Low: number; Close: number }[]) =>
    calculateWilderAtr(bars.map((b) => ({ high: b.High, low: b.Low, close: b.Close })))!;

  it('bentuk panggilan produksi dan bentuk panggilan lab menghasilkan setup identik', () => {
    const full = longSeries();
    const price = full[full.length - 1]!.Close;
    const atr = atrOf(full);

    // PRODUKSI (ai-pick-scan/breakout): seluruh histori dikirim apa adanya.
    const setupProduksi = buildLongTradingSetup(full, price, atr);
    // LAB (tpcl-validation): histori sudah dipotong STRUCTURE_LOOKBACK_BARS lebih dulu.
    const setupLab = buildLongTradingSetup(full.slice(-STRUCTURE_LOOKBACK_BARS), price, atr);

    expect(setupProduksi).not.toBeNull();
    expect(setupProduksi).toEqual(setupLab);
  });

  it('bar DI LUAR jendela tidak boleh menggeser stop/TP sama sekali', () => {
    const full = longSeries();
    const price = full[full.length - 1]!.Close;
    const atr = atrOf(full);

    // Bar 0..(n-61) diganti dengan rezim harga yang sama sekali berbeda (4x lebih tinggi).
    // Kalau jendela struktur benar-benar dibatasi, setup-nya tetap identik.
    const tampered = full.map((bar, i) =>
      i < full.length - STRUCTURE_LOOKBACK_BARS
        ? { High: bar.High * 4 + 500, Low: bar.Low * 4 + 480, Close: bar.Close * 4 + 490 }
        : bar
    );

    // Penjaga anti-tautologi: buktikan dulu bahwa perubahan itu MEMANG terlihat kalau
    // jendelanya tidak dibatasi. Tanpa assertion ini, test di bawah bisa lulus hanya
    // karena tampering-nya kebetulan tidak berpengaruh.
    const zonaTanpaJendela = findStructuralZones(tampered, price);
    const zonaDenganJendela = findStructuralZones(tampered.slice(-STRUCTURE_LOOKBACK_BARS), price);
    expect(zonaTanpaJendela.levels.length).not.toBe(zonaDenganJendela.levels.length);

    const asli = buildLongTradingSetup(full, price, atr);
    const diubah = buildLongTradingSetup(tampered, price, atr);
    expect(asli).not.toBeNull();
    expect(diubah).toEqual(asli);
  });
});
