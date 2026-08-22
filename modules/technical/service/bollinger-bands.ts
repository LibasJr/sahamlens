// Bollinger Bands (John Bollinger) - SMA `period` +/- `k` x standar deviasi POPULASI
// (bukan sampel, pembagi N bukan N-1) dari `period` harga terakhir - definisi baku yang
// dipakai TradingView/Stockbit.
//
// Basis harga: AdjClose (price-level indicator, sama seperti SMA/EMA - lihat catatan
// FASE 3 "wajib AdjClose eksplisit" di moving-average.ts/trend-analyzer.ts). BUKAN
// OHLC-dependent seperti ATR/Stochastic karena band ini murni fungsi dari deret harga
// penutupan, tidak melibatkan High/Low.
export const BOLLINGER_PERIOD = 20;
export const BOLLINGER_K = 2;

export interface BollingerBandsResult {
  middle: number;
  upper: number;
  lower: number;
  /** (upper - lower) / middle x 100 - lebar band relatif, indikasi squeeze/ekspansi. */
  bandwidthPct: number;
  /**
   * Posisi harga di dalam band: 0 = tepat di lower band, 1 = tepat di upper band, bisa
   * di luar [0,1] kalau harga tembus band.
   *
   * `null` kalau lebar band NOL (seluruh harga di jendela identik, stddev = 0) - posisi
   * relatif di dalam band yang tidak punya lebar adalah pembagian nol, tidak terdefinisi.
   * FAIL-CLOSED, bukan 0,5: versi pertama file ini (2026-08-22) memakai 0,5 ("titik
   * tengah"), yang tidak bisa dibedakan dari harga yang memang benar-benar di tengah
   * band - cacat yang sama dengan temuan C-7 (`rsi: 50` untuk data yang tidak tersedia).
   *
   * Catatan: `middle`/`upper`/`lower`/`bandwidthPct` TETAP terdefinisi pada kasus ini
   * (ketiganya sama dengan mean, lebar 0) - itu hasil pengukuran nyata, bukan karangan,
   * jadi tidak ikut di-null-kan.
   */
  percentB: number | null;
}

function populationStdDev(values: number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function calculateBollingerBands(
  closes: number[],
  currentPrice: number,
  period = BOLLINGER_PERIOD,
  k = BOLLINGER_K,
): BollingerBandsResult | null {
  if (!Array.isArray(closes) || closes.length < period) return null;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  const window = closes.slice(-period);
  const middle = window.reduce((sum, v) => sum + v, 0) / period;
  if (!Number.isFinite(middle) || middle <= 0) return null;

  const sd = populationStdDev(window);
  const upper = middle + k * sd;
  const lower = middle - k * sd;
  const range = upper - lower;

  return {
    middle,
    upper,
    lower,
    bandwidthPct: (range / middle) * 100,
    percentB: range > 0 ? (currentPrice - lower) / range : null,
  };
}
