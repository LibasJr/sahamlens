// Stochastic Oscillator (George Lane) - satu implementasi baku "Slow Stochastic",
// definisi yang sama dipakai TradingView/Stockbit/RTI:
//
//   %K mentah(i)  = (Close(i) - LowestLow(period)) / (HighestHigh(period) - LowestLow(period)) x 100
//   %K "Slow"     = SMA(%K mentah, smoothK)   <- ini yang biasa ditampilkan sebagai "%K"
//   %D            = SMA(%K Slow, periodD)
//
// Basis harga: RAW High/Low/Close (OHLC-dependent), BUKAN AdjClose - alasan yang sama
// dengan ATR (lihat atr.ts): posisi harga di dalam range High-Low akan palsu di sekitar
// corporate action kalau High/Low raw dicampur dengan Close yang sudah disesuaikan.
export const STOCHASTIC_PERIOD = 14;
export const STOCHASTIC_SMOOTH_K = 3;
export const STOCHASTIC_PERIOD_D = 3;

export interface StochasticBar {
  high: number;
  low: number;
  close: number;
}

export interface StochasticResult {
  k: number;
  d: number;
}

function sma(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * %K mentah per bar, mulai dari index `period - 1`. `null` kalau range jendela DATAR
 * (HH = LL, mis. saham yang benar-benar tidak bertransaksi sepanjang jendela).
 *
 * FAIL-CLOSED, BUKAN 50. Versi pertama file ini (2026-08-22) mengembalikan 50 - "titik
 * tengah" - untuk kasus ini. Itu persis temuan C-7 yang sudah pernah diperbaiki di
 * scoring.service.ts: `rsi: 50` dikirim saat RSI tidak tersedia, lalu 50 jatuh tepat di
 * pita "zona BUY ideal" - ketiadaan data DIHADIAHI skor. %K = 50 punya cacat yang sama:
 * ia bukan hasil pengukuran, ia angka karangan yang tidak bisa dibedakan dari saham yang
 * benar-benar berada di tengah range-nya.
 */
function rawKSeries(bars: StochasticBar[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = period - 1; i < bars.length; i++) {
    const window = bars.slice(i - period + 1, i + 1);
    const highest = Math.max(...window.map((b) => b.high));
    const lowest = Math.min(...window.map((b) => b.low));
    const range = highest - lowest;
    out.push(range > 0 ? ((bars[i]!.close - lowest) / range) * 100 : null);
  }
  return out;
}

/**
 * Stochastic Slow pada bar terakhir. `null` kalau bar tidak cukup untuk seluruh rantai
 * smoothing (period untuk %K mentah, lalu smoothK untuk %K Slow, lalu periodD untuk %D).
 */
export function calculateStochastic(
  bars: StochasticBar[],
  period = STOCHASTIC_PERIOD,
  smoothK = STOCHASTIC_SMOOTH_K,
  periodD = STOCHASTIC_PERIOD_D,
): StochasticResult | null {
  if (!Array.isArray(bars) || bars.length < period + smoothK + periodD - 2) return null;

  const rawK = rawKSeries(bars, period);
  if (rawK.length < smoothK + periodD - 1) return null;

  // Null menular lewat kedua lapis smoothing: satu %K mentah yang tidak terdefinisi
  // membuat SMA yang memuatnya ikut tidak terdefinisi. Menghitungnya dengan membuang
  // yang null diam-diam akan menghasilkan rata-rata atas jendela yang lebih pendek dari
  // yang dijanjikan namanya - itu bukan Stochastic (14,3,3) lagi.
  const slowK: Array<number | null> = [];
  for (let i = smoothK - 1; i < rawK.length; i++) {
    const window = rawK.slice(i - smoothK + 1, i + 1);
    slowK.push(window.every((v): v is number => v != null) ? sma(window) : null);
  }
  if (slowK.length < periodD) return null;

  const k = slowK[slowK.length - 1];
  const dWindow = slowK.slice(-periodD);
  if (k == null || !dWindow.every((v): v is number => v != null)) return null;
  const d = sma(dWindow);
  if (!Number.isFinite(k) || !Number.isFinite(d)) return null;
  return { k, d };
}
