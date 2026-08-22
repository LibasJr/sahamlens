// ADX / +DI / -DI (J. Welles Wilder, 1978 - paper yang sama dengan RSI dan ATR) - satu
// implementasi baku Wilder smoothing (RMA), definisi yang sama dipakai TradingView/
// Stockbit/RTI. True Range diimpor dari atr.ts (bukan dihitung ulang di sini) - True
// Range adalah komponen bersama ATR dan ADX, dan menduplikasinya persis pola yang
// berulang kali jadi bug di app ini (lihat riwayat bug di atr.ts).
//
// Basis harga: RAW High/Low/Close (OHLC-dependent, sama alasan dengan ATR/Stochastic).
//
// ALGORITMA (persis paper Wilder, bukan varian yang disederhanakan):
//   1. Per bar: +DM = kenaikan High hari ini jika itu pergerakan dominan & positif,
//      -DM = penurunan Low hari ini jika itu pergerakan dominan & positif, TR = True Range.
//   2. Seed: JUMLAH (bukan rata-rata) `period` nilai TR/+DM/-DM pertama.
//   3. Smoothing Wilder untuk sisanya: smoothed = smoothed - smoothed/period + baru.
//      Ini beda tipis dari RMA di RSI/ATR (yang menulis avg = (avg*(p-1)+baru)/p) tetapi
//      SECARA ALJABAR IDENTIK - smoothed - smoothed/p + baru = (smoothed*(p-1) + baru*p)/p,
//      sedikit berbeda dari avg biasa karena Wilder ADX men-smoothing JUMLAH, bukan
//      rata-rata; +DI/-DI baru dibagi TR setelahnya. Ditulis dalam bentuk sum (persis
//      notasi asli Wilder) supaya bisa diverifikasi baris demi baris terhadap paper aslinya.
//   4. +DI = 100 x smoothed(+DM) / smoothed(TR), -DI = 100 x smoothed(-DM) / smoothed(TR).
//   5. DX = 100 x |+DI - -DI| / (+DI + -DI).
//   6. ADX = Wilder-smoothed (RMA biasa) dari deret DX, di-seed rata-rata `period` DX
//      pertama - smoothing KEDUA, terpisah dari smoothing TR/DM di langkah 3.
//
// Butuh minimal 2 x period bar: `period` bar untuk men-seed smoothed TR/DM (menghasilkan
// 1 nilai DX), lalu `period` nilai DX lagi untuk men-seed ADX pertama. Seperti ATR,
// pengaruh titik seed meluruh eksponensial pada bar-bar berikutnya - ADX pada bar
// setepat mungkin butuh histori lebih panjang dari minimum ini untuk benar-benar
// konvergen, tapi FORMULA-nya sudah benar sejak nilai pertama.
import { trueRangeAt, type TrueRangeBar } from './atr';

export const ADX_PERIOD = 14;

export interface AdxResult {
  adx: number;
  plusDi: number;
  minusDi: number;
}

export function calculateAdx(bars: TrueRangeBar[], period = ADX_PERIOD): AdxResult | null {
  if (!Array.isArray(bars) || bars.length < 2 * period) return null;

  const plusDmArr: number[] = [];
  const minusDmArr: number[] = [];
  const trArr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i]!.high - bars[i - 1]!.high;
    const downMove = bars[i - 1]!.low - bars[i]!.low;
    // FAIL-CLOSED. Versi pertama file ini (2026-08-22) menulis `trueRangeAt(...) ?? 0`.
    // TR bernilai null berarti barnya CACAT (high/low/close bukan angka terhingga) -
    // bukan berarti rentangnya nol. Menyulapnya jadi 0 membuat smoothing Wilder
    // meneruskan angka karangan itu ke SELURUH bar sesudahnya, dan hasil ADX-nya tetap
    // tampil seolah-olah hasil pengukuran. Deret yang cacat tidak menghasilkan ADX.
    const tr = trueRangeAt(bars, i);
    if (tr == null || !Number.isFinite(upMove) || !Number.isFinite(downMove)) return null;
    plusDmArr.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDmArr.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trArr.push(tr);
  }
  if (trArr.length < period) return null;

  let smoothedTR = trArr.slice(0, period).reduce((sum, v) => sum + v, 0);
  let smoothedPlusDM = plusDmArr.slice(0, period).reduce((sum, v) => sum + v, 0);
  let smoothedMinusDM = minusDmArr.slice(0, period).reduce((sum, v) => sum + v, 0);

  // FAIL-CLOSED di kedua cabang. Versi pertama file ini (2026-08-22) mengembalikan
  // {plusDi: 0, minusDi: 0, dx: 0} saat trSum <= 0, dan dx = 0 saat +DI + -DI = 0.
  // Keduanya adalah pembagian nol - besarannya TIDAK TERDEFINISI, bukan nol. Angka nol
  // di sini tidak bisa dibedakan dari hasil pengukuran "benar-benar tidak ada gerakan
  // berarah", dan itu tepat yang dilarang temuan C-7.
  function diAt(trSum: number, plusDmSum: number, minusDmSum: number): { plusDi: number; minusDi: number; dx: number } | null {
    if (!(trSum > 0)) return null;
    const plusDi = (100 * plusDmSum) / trSum;
    const minusDi = (100 * minusDmSum) / trSum;
    const total = plusDi + minusDi;
    if (!(total > 0)) return null;
    const dx = (100 * Math.abs(plusDi - minusDi)) / total;
    return { plusDi, minusDi, dx };
  }

  const dxSeries: number[] = [];
  let lastDi = diAt(smoothedTR, smoothedPlusDM, smoothedMinusDM);
  if (lastDi == null) return null;
  dxSeries.push(lastDi.dx);

  for (let j = period; j < trArr.length; j++) {
    smoothedTR = smoothedTR - smoothedTR / period + trArr[j]!;
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDmArr[j]!;
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDmArr[j]!;
    const di = diAt(smoothedTR, smoothedPlusDM, smoothedMinusDM);
    // Satu titik yang tidak terdefinisi merusak seluruh rantai smoothing sesudahnya -
    // ADX di-seed dari rata-rata `period` DX pertama, jadi tidak ada cara jujur
    // "melewati" satu nilai tanpa mengubah arti angkanya.
    if (di == null) return null;
    lastDi = di;
    dxSeries.push(di.dx);
  }

  if (dxSeries.length < period) return null;

  // Smoothing KEDUA (Wilder RMA biasa, seperti RSI/ATR): ADX di-seed rata-rata `period`
  // DX pertama, lalu smoothing eksponensial-menurun untuk sisanya.
  let adx = dxSeries.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  for (let j = period; j < dxSeries.length; j++) {
    adx = (adx * (period - 1) + dxSeries[j]!) / period;
  }

  if (!Number.isFinite(adx) || !Number.isFinite(lastDi.plusDi) || !Number.isFinite(lastDi.minusDi)) return null;
  return { adx, plusDi: lastDi.plusDi, minusDi: lastDi.minusDi };
}
