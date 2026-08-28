import YahooFinanceClass from 'yahoo-finance2';
import { SCREENER_UNIVERSE } from '@/modules/market/service/screener.service';

// Backend REAL untuk halaman /dividend ("Dividend Compounding Planner") - sebelumnya
// halaman itu memanggil /api/live/[ticker] (cuma balikin harga+volume, TIDAK PERNAH
// ada field quant.* yang dibutuhkan) sehingga SEMUA angka di halaman itu selalu kosong
// atau fallback hardcode 7.1% (ditemukan saat audit dummy-data 2026-08-01). Semua angka
// di bawah dihitung dari data Yahoo Finance riil:
// - yield_pct/payout_ratio: langsung dari summaryDetail
// - consistency_years: dihitung dari histori pembayaran dividen REAL (chart events),
//   bukan dikarang - jumlah tahun kalender berturut-turut (mundur dari tahun ini) yang
//   punya minimal 1 pembayaran dividen tercatat
// - safety_score: HEURISTIK (didokumentasikan, bukan data resmi) dari payout_ratio +
//   consistency_years - payout rendah & histori panjang = lebih aman
const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

export interface DividendStock {
  ticker: string;
  yield_pct: number;
  safety_score: number;
  payout_ratio: number | null;
  consistency_years: number;
  is_aristocrat: boolean;
}

export interface CompoundingYear {
  year: number;
  capital_end_of_year: number;
  monthly_passive_income: number;
}

export type DividendPlanMode = 'universe' | 'ticker';

export interface DividendPlanResult {
  mode: DividendPlanMode;
  average_portfolio_yield: number;
  est_monthly_income_now: number;
  est_annual_income_now: number;
  required_capital_for_target: number;
  div_stocks: DividendStock[];
  compounding_schedule: CompoundingYear[];
  ticker_stock?: DividendStock | null;
}

// Payout rendah (masih banyak laba ditahan) + histori panjang = lebih aman. Payout
// > 100% (bagi dividen lebih besar dari laba tahun itu) = tanda bahaya, tidak
// sustainable jangka panjang.
function safetyScore(payoutRatio: number | null, consistencyYears: number): number {
  let score = 5;
  if (payoutRatio != null) {
    if (payoutRatio > 100) score -= 2;
    else if (payoutRatio > 85) score -= 1;
    else if (payoutRatio < 40) score += 2;
    else if (payoutRatio < 70) score += 1;
  }
  score += Math.min(3, Math.floor(consistencyYears / 3));
  return Math.max(1, Math.min(10, Math.round(score)));
}

type FetchDividendStockOptions = {
  requireCurrentDividend?: boolean;
};

export function normalizeIdxDividendTicker(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9.]/g, '');
  if (!cleaned) return null;
  const withoutSuffix = cleaned.endsWith('.JK') ? cleaned.slice(0, -3) : cleaned;
  if (!/^[A-Z0-9]{2,8}$/.test(withoutSuffix)) return null;
  return withoutSuffix + '.JK';
}

async function fetchDividendStock(ticker: string, options: FetchDividendStockOptions = {}): Promise<DividendStock | null> {
  const requireCurrentDividend = options.requireCurrentDividend ?? true;
  try {
    const [summary, chart] = await Promise.all([
      yahooFinance.quoteSummary(ticker, { modules: ['summaryDetail'] }),
      yahooFinance
        .chart(ticker, { period1: '2015-01-01', interval: '1mo', events: 'dividends' as any })
        .catch(() => null),
    ]);

    const yieldRaw = summary?.summaryDetail?.dividendYield;
    const yieldPct = typeof yieldRaw === 'number' && Number.isFinite(yieldRaw) && yieldRaw > 0
      ? yieldRaw * 100
      : 0;
    if (requireCurrentDividend && yieldPct <= 0) return null; // tidak bagi dividen - skip dari daftar universe

    const payoutRaw = summary?.summaryDetail?.payoutRatio;
    const payoutRatio = typeof payoutRaw === 'number' && Number.isFinite(payoutRaw) ? payoutRaw * 100 : null;

    const dividendEvents: { date: string | Date }[] = (chart as any)?.events?.dividends || [];
    const yearsWithDividend = new Set(dividendEvents.map((d) => new Date(d.date).getFullYear()));
    const observedYears = [...yearsWithDividend].sort((a, b) => b - a);
    const latestDividendYear = observedYears[0] ?? null;
    let consistencyYears = 0;
    if (latestDividendYear != null) {
      for (let y = latestDividendYear; y >= latestDividendYear - 15; y--) {
        if (yearsWithDividend.has(y)) consistencyYears++;
        else break;
      }
    }

    const currentSafety = yieldPct > 0 ? safetyScore(payoutRatio, consistencyYears) : 1;
    const isAristocrat = yieldPct > 0 && consistencyYears >= 5 && (payoutRatio == null || (payoutRatio > 0 && payoutRatio <= 85)) && currentSafety >= 7;

    return {
      ticker: ticker.replace('.JK', ''),
      yield_pct: parseFloat(yieldPct.toFixed(2)),
      safety_score: currentSafety,
      payout_ratio: payoutRatio != null ? parseFloat(payoutRatio.toFixed(1)) : null,
      consistency_years: consistencyYears,
      is_aristocrat: isAristocrat,
    };
  } catch {
    return null; // ticker gagal fetch - dilewati, tidak menggagalkan yang lain
  }
}

// BUG FIX (audit integritas data 2026-08-03, temuan M-08): dulu di-slice ke 18 saham
// dividen TERTINGGI di sini SEBELUM buildDividendPlan() menghitung avgYield - artinya
// "rata-rata yield portofolio" yang dipakai memproyeksikan penghasilan bulanan & modal
// yang dibutuhkan sebenarnya adalah rata-rata KUARTIL TERATAS universe (saham dividen
// tertinggi), bukan yield yang realistis untuk portofolio biasa. Modal yang dibutuhkan
// untuk target penghasilan jadi terlalu rendah, proyeksi penghasilan terlalu tinggi.
// Sekarang mengembalikan SELURUH saham dividen yang ditemukan (tidak di-slice) - potong
// ke daftar tampilan dilakukan terpisah di buildDividendPlan() di bawah, avgYield
// dihitung dari universe PENUH.
//
// Bagian mahal (batch quoteSummary+chart utk ~50 saham) - di-cache di route handler
// (app/api/dividend-plan) lewat getOrCompute, dipakai ulang lintas request/user karena
// tidak bergantung input modal/target siapa pun.
export async function fetchDividendUniverse(): Promise<DividendStock[]> {
  const BATCH_SIZE = 15;
  const results: DividendStock[] = [];

  for (let i = 0; i < SCREENER_UNIVERSE.length; i += BATCH_SIZE) {
    const batch = SCREENER_UNIVERSE.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((ticker) => fetchDividendStock(ticker, { requireCurrentDividend: true })));
    batchResults.forEach((r) => { if (r) results.push(r); });
  }

  results.sort((a, b) => b.yield_pct - a.yield_pct);
  return results;
}

// Saham ditampilkan di tabel UI - dibatasi supaya tabel tidak terlalu panjang, TAPI
// batasan ini TIDAK BOLEH ikut mempengaruhi avgYield (lihat temuan M-08 di atas).
const DISPLAY_CAP = 18;

// Bagian murah (matematika dari input modal/target user) - DIHITUNG ULANG tiap
// request dari universe yang di-cache, tidak ikut di-cache (beda per user/input).
function buildPlanFromYield(yieldPct: number, capital: number, targetMonthly: number): Omit<DividendPlanResult, 'mode' | 'div_stocks' | 'ticker_stock'> {
  const estAnnualIncomeNow = capital * (yieldPct / 100);
  const estMonthlyIncomeNow = estAnnualIncomeNow / 12;
  const requiredCapitalForTarget = yieldPct > 0 ? (targetMonthly * 12) / (yieldPct / 100) : 0;

  // Simulasi DRIP (reinvestasi penuh) 10 tahun - proyeksi compound growth dari yield
  // yang sedang dipilih. Ini simulasi matematis, bukan prediksi harga/dividen.
  const compoundingSchedule: CompoundingYear[] = [];
  let runningCapital = capital;
  for (let year = 1; year <= 10; year++) {
    runningCapital *= 1 + yieldPct / 100;
    compoundingSchedule.push({
      year,
      capital_end_of_year: Math.round(runningCapital),
      monthly_passive_income: Math.round((runningCapital * (yieldPct / 100)) / 12),
    });
  }

  return {
    average_portfolio_yield: parseFloat(yieldPct.toFixed(2)),
    est_monthly_income_now: Math.round(estMonthlyIncomeNow),
    est_annual_income_now: Math.round(estAnnualIncomeNow),
    required_capital_for_target: Math.round(requiredCapitalForTarget),
    compounding_schedule: compoundingSchedule,
  };
}

export async function fetchTickerDividendStock(input: string): Promise<DividendStock | null> {
  const ticker = normalizeIdxDividendTicker(input);
  if (!ticker) return null;
  return fetchDividendStock(ticker, { requireCurrentDividend: false });
}

// Bagian murah (matematika dari input modal/target user) - DIHITUNG ULANG tiap
// request dari universe yang di-cache, tidak ikut di-cache (beda per user/input).
export function buildDividendPlan(universe: DividendStock[], capital: number, targetMonthly: number): DividendPlanResult {
  // avgYield dari SELURUH universe (bukan cuma yang ditampilkan) - representatif untuk
  // "portofolio saham dividen" pada umumnya, bukan cuma yield tertinggi.
  const avgYield = universe.length > 0
    ? universe.reduce((sum, s) => sum + s.yield_pct, 0) / universe.length
    : 0;

  return {
    mode: 'universe',
    ...buildPlanFromYield(avgYield, capital, targetMonthly),
    // Ditampilkan hanya DISPLAY_CAP teratas (sudah terurut yield desc dari
    // fetchDividendUniverse) - avgYield DI ATAS tetap dari universe penuh.
    div_stocks: universe.slice(0, DISPLAY_CAP),
    ticker_stock: null,
  };
}

export function buildTickerDividendPlan(stock: DividendStock, capital: number, targetMonthly: number): DividendPlanResult {
  return {
    mode: 'ticker',
    ...buildPlanFromYield(stock.yield_pct, capital, targetMonthly),
    div_stocks: [stock],
    ticker_stock: stock,
  };
}
