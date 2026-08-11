// ATR (Average True Range) - satu implementasi baku Wilder smoothing, dipakai oleh SEMUA
// pemanggil ATR di aplikasi ini (volatility-analyzer.ts, breakout.service.ts,
// tpcl-validation.service.ts).
//
// BUG FIX (audit kuantitatif 2026-08-11, temuan C-01): tiga file di atas sebelumnya punya
// implementasi ATR sendiri-sendiri, dan DUA DI ANTARANYA MEMAKAI FORMULA YANG BERBEDA:
//
//   produksi (volatility-analyzer.ts, breakout.service.ts)
//     -> RATA-RATA ARITMATIK SEDERHANA dari 14 True Range terakhir
//   TP/CL Validation Lab (tpcl-validation.service.ts)
//     -> Wilder smoothing (RMA)
//
// Rata-rata sederhana BUKAN definisi ATR. J. Welles Wilder (1978) mendefinisikannya
// sebagai rata-rata ter-smoothing, dan itu yang dipakai TradingView/Stockbit/RTI. Ini
// kesalahan yang SAMA PERSIS dengan temuan H-01 pada RSI (lihat rsi.ts) - koreksinya
// waktu itu tidak pernah diterapkan ke ATR.
//
// Diverifikasi empiris (Yahoo Finance, 244 bar, 2026-08-11):
//   BBCA  rata-rata sederhana 146.43  vs Wilder 163.85  (-10.63%)
//   BBRI  rata-rata sederhana  63.57  vs Wilder  73.72  (-13.77%)
//   TLKM  rata-rata sederhana  85.71  vs Wilder  90.50   (-5.29%)
//   ASII  rata-rata sederhana 142.14  vs Wilder 155.48   (-8.58%)
//
// Kenapa ini serius, bukan sekadar selisih angka: ATR masuk LANGSUNG ke
// buildLongTradingSetup() sebagai `stop = harga - k x ATR` dan `TP1 = entry + 2 x risk`.
// ATR produksi yang lebih kecil ~10% berarti stop ~10% lebih sempit dan target ~10% lebih
// dekat daripada setup yang diukur TP/CL Lab. Seluruh win rate, SL hit rate, expectancy,
// dan distribusi MAE/MFE yang dilaporkan lab itu milik strategi yang TIDAK PERNAH dikirim
// ke pengguna.
//
// PERUBAHAN PERILAKU YANG DISENGAJA: implementasi lab lama membuang True Range yang
// bernilai 0 (`if (tr > 0) trs.push(tr)`). TR = 0 terjadi pada bar yang benar-benar datar
// (high = low = close = close sebelumnya), yaitu hari tanpa transaksi. Hari itu MEMANG
// punya rentang nol, dan membuangnya menaikkan ATR secara artifisial untuk saham yang
// sering tidak bertransaksi - persis saham yang stop-nya paling perlu lebar. Wilder baku
// memasukkan seluruh TR, jadi di sini seluruh TR yang terhingga ikut dihitung.

export const ATR_PERIOD = 14;

export interface TrueRangeBar {
  high: number;
  low: number;
  close: number;
}

function trueRangeAt(bars: TrueRangeBar[], i: number): number | null {
  const curr = bars[i];
  const prev = bars[i - 1];
  if (!curr || !prev) return null;
  const tr = Math.max(
    curr.high - curr.low,
    Math.abs(curr.high - prev.close),
    Math.abs(curr.low - prev.close)
  );
  return Number.isFinite(tr) && tr >= 0 ? tr : null;
}

/**
 * ATR Wilder atas SELURUH deret yang diberikan, dikembalikan pada bar terakhir.
 *
 * Seed: rata-rata `period` True Range pertama. Sisanya di-smoothing
 * `atr = (atr x (period - 1) + tr) / period` - inilah yang membedakan Wilder dari
 * rata-rata aritmatik: setiap hari terus ikut mempengaruhi hasilnya secara
 * eksponensial-menurun, bukan cuma 14 hari terakhir dihitung ulang dari nol.
 *
 * Pengaruh seed meluruh dengan faktor (13/14)^n, jadi pemanggil yang memberi jendela
 * berbeda (200 bar di Detail Saham, ~250 di precompute, 5 tahun di TP/CL Lab) tetap
 * menghasilkan angka yang sama dalam batas wajar: pada 200 bar sisa pengaruh seed
 * sekitar 1e-6 relatif. Yang TIDAK boleh berbeda adalah formulanya, dan itu yang
 * dijamin file ini.
 *
 * `null` kalau bar tidak cukup (< period + 1) atau hasilnya bukan angka positif -
 * pemanggil WAJIB memperlakukannya sebagai "ATR tidak tersedia", bukan 0.
 */
export function calculateWilderAtr(bars: TrueRangeBar[], period = ATR_PERIOD): number | null {
  if (!Array.isArray(bars) || bars.length < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = trueRangeAt(bars, i);
    if (tr != null) trueRanges.push(tr);
  }
  if (trueRanges.length < period) return null;

  let atr = trueRanges.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]!) / period;
  }
  return Number.isFinite(atr) && atr > 0 ? atr : null;
}

/**
 * ATR Wilder pada bar ke-`index`, memakai bar 0..index saja.
 *
 * Dipakai backtest/validasi yang berjalan mundur di sepanjang deret: bar SETELAH `index`
 * tidak boleh ikut mempengaruhi ATR pada tanggal itu (look-ahead).
 */
export function wilderAtrAt(bars: TrueRangeBar[], index: number, period = ATR_PERIOD): number | null {
  if (!Array.isArray(bars) || index < period || index >= bars.length) return null;
  return calculateWilderAtr(bars.slice(0, index + 1), period);
}
