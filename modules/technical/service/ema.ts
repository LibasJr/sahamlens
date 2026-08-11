/**
 * EMA baku - SATU implementasi untuk seluruh aplikasi.
 *
 * KENAPA FILE INI ADA. Sampai 2026-08-12 ada TIGA salinan EMA yang berbeda:
 *
 *   ema-analyzer.ts    seed = SMA periode pertama   (benar)
 *   macd-analyzer.ts   seed = SMA periode pertama   (benar, salinan identik)
 *   lib/miniCouncil.ts seed = harga pertama         (SALAH - bug L-3 yang sudah
 *                                                    diperbaiki di dua file lain pada
 *                                                    audit 2026-08-05, tetapi salinan
 *                                                    ini tidak ikut diperbaiki)
 *
 * miniCouncil memberi makan MACD-nya sendiri dari EMA itu, dan hasilnya tampil di
 * halaman yang sama dengan MACD dari macd-analyzer. Dua angka MACD berbeda untuk emiten
 * yang sama, di layar yang sama.
 *
 * Diukur pada 7 panjang deret: selisih seed TIDAK membalik arah histogram - biasnya
 * meluruh eksponensial dan praktis hilang setelah ~40 bar. Jadi ini bukan penyebab
 * sinyal yang bertentangan (itu soal cara menghitung suara, lihat miniCouncil), tetapi
 * salinan indikator yang berbeda adalah kelas bug yang sama dengan C-01 (dua ATR) dan
 * tetap harus dihapus: selama salinannya ada, tidak ada yang menjamin ia tetap sama
 * setelah perbaikan berikutnya.
 *
 * SEED = SMA, bukan harga pertama. Rata-rata bergerak yang dimulai dari satu harga
 * tunggal membawa bias awal yang bertumpuk pada MACD (EMA atas hasil EMA). Seed SMA
 * adalah definisi yang dipakai TradingView/Stockbit dan yang diuji golden test.
 */

/**
 * Deret EMA sepanjang `prices`.
 *
 * Indeks 0..period-1 diisi nilai seed supaya panjang keluaran SAMA dengan masukan -
 * pemanggil memetakan hasilnya per indeks (MACD mengurangkan dua deret elemen per
 * elemen). Nilai di rentang seed itu BUKAN EMA yang sah; pemanggil yang butuh
 * kebenaran per titik wajib mulai membaca dari indeks `period - 1`.
 */
export function calculateEmaSeries(prices: number[], period: number): number[] {
  if (!Array.isArray(prices) || prices.length === 0) return [];
  const k = 2 / (period + 1);

  if (prices.length < period) {
    // Bar belum cukup untuk seed SMA. Perilaku lama dipertahankan apa adanya -
    // pemanggil sudah menjaga panjang minimum sebelum memakai hasilnya.
    const out: number[] = [prices[0]!];
    for (let i = 1; i < prices.length; i++) out.push(prices[i]! * k + out[i - 1]! * (1 - k));
    return out;
  }

  const seed = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out: number[] = [];
  for (let i = 0; i < period; i++) out.push(seed);
  for (let i = period; i < prices.length; i++) out.push(prices[i]! * k + out[i - 1]! * (1 - k));
  return out;
}

/** Indeks pertama yang nilainya EMA sah, bukan isian seed. */
export function firstValidEmaIndex(period: number): number {
  return period - 1;
}

export const MACD_FAST = 12;
export const MACD_SLOW = 26;
export const MACD_SIGNAL = 9;

export interface MacdValues {
  macdLine: number;
  macdSignal: number;
  macdHist: number;
}

/**
 * MACD(12,26,9) baku - satu implementasi, dipakai macd-analyzer maupun miniCouncil.
 *
 * Signal line dihitung HANYA atas bagian MACD line yang sah, yaitu mulai indeks
 * `MACD_SLOW - 1`. Sebelum perbaikan M-10 (2026-08-12), macd-analyzer menghitungnya atas
 * seluruh panjang deret termasuk rentang tempat helper EMA masih mengisi konstanta seed -
 * sembilan nilai yang men-seed signal adalah selisih antara dua konstanta buatan, bukan
 * MACD. Definisi baku (Appel; sama dengan TradingView) adalah yang dipakai di sini.
 *
 * `null` kalau bar tidak cukup untuk membentuk signal line yang sah.
 */
export function calculateMacd(
  closes: number[],
  fast = MACD_FAST,
  slow = MACD_SLOW,
  signal = MACD_SIGNAL,
): MacdValues | null {
  if (!Array.isArray(closes) || closes.length < slow + signal - 1) return null;

  const emaFast = calculateEmaSeries(closes, fast);
  const emaSlow = calculateEmaSeries(closes, slow);
  const firstValid = slow - 1;
  const macdLine = emaFast.slice(firstValid).map((value, i) => value - emaSlow[i + firstValid]!);
  if (macdLine.length < signal) return null;

  const signalLine = calculateEmaSeries(macdLine, signal);
  const lastMacd = macdLine[macdLine.length - 1]!;
  const lastSignal = signalLine[signalLine.length - 1]!;
  if (!Number.isFinite(lastMacd) || !Number.isFinite(lastSignal)) return null;

  return { macdLine: lastMacd, macdSignal: lastSignal, macdHist: lastMacd - lastSignal };
}
