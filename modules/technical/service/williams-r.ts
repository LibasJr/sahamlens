// Williams %R (Larry Williams) - posisi Close di dalam range Highest High/Lowest Low
// `period` bar, diskalakan 0 s/d -100 (baku: 0 = di puncak range, -100 = di dasar
// range). Ditulis independen dari stochastic.ts (bukan diturunkan `%K - 100`) meskipun
// keduanya secara matematis berhubungan - supaya kedua indikator saling silang-periksa
// di test: kalau salah satu implementasinya salah, keduanya akan berselisih pada data
// yang sama, bukan diam-diam ikut salah bersama.
//
// Basis harga: RAW High/Low/Close, sama alasan dengan Stochastic/ATR (OHLC-dependent).
export const WILLIAMS_R_PERIOD = 14;

export interface WilliamsRBar {
  high: number;
  low: number;
  close: number;
}

/** `null` kalau bar tidak cukup. Range datar (HH=LL) didefinisikan -50 (titik tengah),
 * bukan hasil pembagian nol. */
export function calculateWilliamsR(bars: WilliamsRBar[], period = WILLIAMS_R_PERIOD): number | null {
  if (!Array.isArray(bars) || bars.length < period) return null;

  const window = bars.slice(-period);
  const highest = Math.max(...window.map((b) => b.high));
  const lowest = Math.min(...window.map((b) => b.low));
  const range = highest - lowest;
  const close = bars[bars.length - 1]!.close;

  if (!Number.isFinite(highest) || !Number.isFinite(lowest) || !Number.isFinite(close)) return null;
  if (range <= 0) return -50;

  const value = ((highest - close) / range) * -100;
  return Number.isFinite(value) ? value : null;
}
