import { MACRO_ASSUMPTIONS } from '@/modules/fundamental/service/fair-multiples.service';

/**
 * METRIK KINERJA SIMULATOR (temuan H-5 audit kuantitatif 2026-08-11).
 *
 * Sebelum ini simulator hanya melaporkan returnPct, alpha, winRate, maxDrawdown, dan
 * totalTrades. Semuanya benar, dan semuanya diam soal satu pertanyaan: berapa risiko yang
 * ditanggung untuk mendapatkannya. Return 40% dengan volatilitas 15% dan return 40% dengan
 * volatilitas 60% tampil identik di layar lama.
 *
 * Semua angka di sini dihitung dari kurva ekuitas HARIAN yang memang sudah dibangun
 * simulator, bukan dari kurva bulanan yang dipakai chart. Sampling bulanan menghaluskan
 * pergerakan intra-bulan, dan volatilitas yang dihitung darinya akan sistematis terlalu
 * kecil - yang berarti Sharpe sistematis terlalu besar.
 */

/**
 * Panjang minimum deret return harian sebelum Sharpe/Sortino boleh dilaporkan. Sengaja
 * TIDAK memakai konstanta 30 milik lapisan validasi sinyal: yang dibatasi di sini adalah
 * panjang deret waktu, bukan jumlah sinyal independen. Menyamakan keduanya hanya karena
 * angkanya mirip akan menyembunyikan bahwa keduanya membatasi hal yang berbeda.
 */
export const MIN_RETURN_OBSERVATIONS = 20;

/** Hari dalam setahun kalender, termasuk tahun kabisat. Dipakai mengubah rentang tanggal jadi tahun. */
const DAYS_PER_YEAR = 365.25;

export interface PerformanceTradeInput {
  /** Laba/rugi dalam rupiah. Profit factor WAJIB memakai uang, bukan persen: ukuran posisi
   * ikut membesar seiring compounding, jadi menjumlahkan persen memberi bobot sama pada
   * trade yang nilainya berbeda jauh. */
  pnlValue: number;
  pnlPct: number;
}

export interface PerformanceMetricsInput {
  /** Ekuitas mark-to-market per hari bursa. */
  equityCurveDaily: number[];
  /** Tanggal sejajar dengan equityCurveDaily, YYYY-MM-DD. */
  dates: string[];
  initialCapital: number;
  trades: PerformanceTradeInput[];
  /** Total nilai rupiah semua order beli dan jual yang benar-benar tereksekusi. */
  totalBuyValue: number;
  totalSellValue: number;
}

export interface PerformanceMetrics {
  /** Jumlah return harian yang benar-benar terhitung. */
  returnObservations: number;
  /** Rentang waktu dalam tahun, dari tanggal pertama ke terakhir. Bukan aproksimasi 22 hari/bulan. */
  years: number | null;
  /** Compound annual growth rate, persen. */
  cagrPct: number | null;
  /** Standar deviasi return harian, disetahunkan, persen. */
  annualizedVolatilityPct: number | null;
  /** (return - risk free) / volatilitas, disetahunkan. */
  sharpe: number | null;
  /** Seperti Sharpe tetapi penyebutnya hanya deviasi sisi bawah. */
  sortino: number | null;
  /** Total laba / total rugi, dalam rupiah. null kalau tidak ada satu pun trade rugi. */
  profitFactor: number | null;
  /** Rata-rata P/L per trade, persen. */
  expectancyPct: number | null;
  /** (nilai beli + nilai jual) / 2 / ekuitas rata-rata / tahun. 1,0x = memutar seluruh portofolio sekali setahun. */
  turnoverAnnualX: number | null;
  tradesPerYear: number | null;
  /** Asumsi risk-free yang dipakai Sharpe/Sortino, dinyatakan supaya bisa dibantah. */
  riskFreeRatePct: number;
  riskFreeSetOn: string;
  /** Kosong kalau semua terhitung; berisi alasan kalau ada yang null. */
  note: string;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Standar deviasi sampel (penyebut n-1). Deret ini sampel dari proses, bukan populasi. */
function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function yearsBetween(first: string, last: string): number | null {
  const start = Date.parse(`${first}T00:00:00Z`);
  const end = Date.parse(`${last}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return (end - start) / (1000 * 60 * 60 * 24 * DAYS_PER_YEAR);
}

export function calculatePerformanceMetrics(input: PerformanceMetricsInput): PerformanceMetrics {
  const { equityCurveDaily, dates, initialCapital, trades, totalBuyValue, totalSellValue } = input;

  const empty: PerformanceMetrics = {
    returnObservations: 0,
    years: null,
    cagrPct: null,
    annualizedVolatilityPct: null,
    sharpe: null,
    sortino: null,
    profitFactor: null,
    expectancyPct: null,
    turnoverAnnualX: null,
    tradesPerYear: null,
    riskFreeRatePct: MACRO_ASSUMPTIONS.RISK_FREE_RATE_PCT,
    riskFreeSetOn: MACRO_ASSUMPTIONS.SET_ON,
    note: '',
  };

  // Profit factor dan expectancy hanya butuh trade, jadi keduanya tetap dihitung walaupun
  // deret ekuitasnya terlalu pendek untuk Sharpe.
  const grossProfit = trades.filter((t) => t.pnlValue > 0).reduce((sum, t) => sum + t.pnlValue, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnlValue < 0).reduce((sum, t) => sum + t.pnlValue, 0));
  empty.profitFactor = grossLoss > 0 ? round(grossProfit / grossLoss, 3) : null;
  empty.expectancyPct = trades.length ? round(mean(trades.map((t) => t.pnlPct)), 3) : null;

  if (equityCurveDaily.length < 2 || dates.length !== equityCurveDaily.length) {
    empty.note = 'Kurva ekuitas harian terlalu pendek atau tidak sejajar dengan tanggalnya; metrik berbasis deret waktu tidak dihitung.';
    return empty;
  }

  const years = yearsBetween(dates[0]!, dates[dates.length - 1]!);
  if (years == null || years <= 0) {
    empty.note = 'Rentang tanggal tidak valid; metrik yang butuh penyetahunan tidak dihitung.';
    return empty;
  }

  const finalEquity = equityCurveDaily[equityCurveDaily.length - 1]!;

  // Return harian dihitung dari ekuitas ke ekuitas. Hari dengan ekuitas nol atau negatif
  // membuat pembagian tidak berarti - dilewati, dan pelewatannya ikut terhitung.
  const dailyReturns: number[] = [];
  let skipped = 0;
  for (let i = 1; i < equityCurveDaily.length; i++) {
    const prev = equityCurveDaily[i - 1]!;
    const current = equityCurveDaily[i]!;
    if (!(prev > 0) || !Number.isFinite(current)) { skipped++; continue; }
    dailyReturns.push(current / prev - 1);
  }

  const result: PerformanceMetrics = {
    ...empty,
    returnObservations: dailyReturns.length,
    years: round(years, 3),
  };

  // CAGR dihitung dari rentang tanggal sungguhan, bukan dari aproksimasi 22 hari bursa per
  // bulan yang dipakai simulator untuk memotong jendela. Modal atau ekuitas akhir yang tidak
  // positif membuat akar pangkatnya tidak terdefinisi.
  if (initialCapital > 0 && finalEquity > 0) {
    result.cagrPct = round(((finalEquity / initialCapital) ** (1 / years) - 1) * 100, 2);
  }

  const tradesPerYear = trades.length / years;
  result.tradesPerYear = round(tradesPerYear, 2);

  const averageEquity = mean(equityCurveDaily.filter((value) => Number.isFinite(value)));
  if (averageEquity > 0) {
    result.turnoverAnnualX = round(((totalBuyValue + totalSellValue) / 2) / averageEquity / years, 3);
  }

  if (dailyReturns.length < MIN_RETURN_OBSERVATIONS) {
    result.note = `Sharpe/Sortino/volatilitas butuh >= ${MIN_RETURN_OBSERVATIONS} return harian, tersedia ${dailyReturns.length}. Rasio risiko dari deret sependek itu didominasi kebetulan.`;
    return result;
  }

  // Periode per tahun DITURUNKAN dari data, bukan dikonstantakan. Dengan begitu faktor
  // penyetahunan CAGR dan Sharpe selalu berasal dari kalender yang sama, dan libur bursa
  // tidak membuat keduanya memakai asumsi berbeda tanpa ada yang menyadari.
  const periodsPerYear = dailyReturns.length / years;
  const dailyRiskFree = (1 + MACRO_ASSUMPTIONS.RISK_FREE_RATE_PCT / 100) ** (1 / periodsPerYear) - 1;
  const excess = dailyReturns.map((value) => value - dailyRiskFree);

  const stdDev = sampleStdDev(dailyReturns);
  if (stdDev != null && stdDev > 0) {
    result.annualizedVolatilityPct = round(stdDev * Math.sqrt(periodsPerYear) * 100, 2);
    const excessStdDev = sampleStdDev(excess);
    if (excessStdDev != null && excessStdDev > 0) {
      result.sharpe = round((mean(excess) / excessStdDev) * Math.sqrt(periodsPerYear), 3);
    }
  }

  // Downside deviation: kuadrat hanya dari sisi rugi, tetapi dirata-rata atas SELURUH
  // pengamatan. Membaginya hanya dengan jumlah hari rugi akan menaikkan Sortino setiap kali
  // strategi jarang rugi - persis kebalikan dari yang seharusnya diukur.
  const downside = Math.sqrt(
    excess.reduce((sum, value) => sum + Math.min(0, value) ** 2, 0) / excess.length
  );
  if (downside > 0) {
    result.sortino = round((mean(excess) / downside) * Math.sqrt(periodsPerYear), 3);
  } else if (result.sharpe != null) {
    result.note = 'Tidak ada satu pun hari dengan return di bawah risk-free; Sortino tidak terdefinisi (penyebutnya nol), bukan tak terhingga.';
  }

  if (skipped > 0) {
    result.note = `${result.note} ${skipped} hari dilewati karena ekuitas sebelumnya tidak positif.`.trim();
  }

  return result;
}
