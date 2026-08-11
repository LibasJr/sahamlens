import YahooFinanceClass from 'yahoo-finance2';
import { cacheGet, cacheSet } from '@/shared/cache/redis-cache';

/**
 * NORMALIZED EARNINGS untuk emiten siklikal (roadmap Fase 4 #16).
 *
 * MASALAH YANG DIPECAHKAN. Laba TTM emiten komoditas tidak mewakili daya labanya. Harga
 * batu bara naik -> laba melonjak -> ROE melonjak dan PER anjlok, dan valuasi berbasis
 * laba TTM menyatakan emiten itu "murah" tepat di titik paling berbahaya. Sampai sekarang
 * SahamLens hanya bisa MENDUGA keadaan itu dari tanda tangan PER rendah + ROE tinggi
 * (`peakCycleSeverity`). Modul ini MENGUKURNYA: berapa ROE tahun berjalan dibandingkan
 * ROE normal emiten itu sendiri.
 *
 * KENAPA ROE, BUKAN EPS. EPS yang dilaporkan Yahoo tidak disesuaikan untuk stock split dan
 * tidak disamakan mata uangnya - emiten seperti ADRO/ITMG melapor dalam USD sementara
 * harganya IDR. ROE = laba bersih / ekuitas, keduanya dari laporan dan tahun yang SAMA,
 * jadi satuan dan jumlah sahamnya saling meniadakan. Tidak ada kurs, tidak ada faktor
 * split, tidak ada asumsi tambahan.
 *
 * KENAPA MEDIAN, BUKAN RATA-RATA. Rata-rata 4 tahun didominasi satu tahun puncak: ITMG
 * 2022 mencetak ROE 61% sementara tiga tahun berikutnya 28/19/10. Rata-ratanya 30% -
 * menjadikan tahun puncak itu bagian dari "normal", persis kebalikan dari yang ingin
 * diukur. Median memberi 24%. CAPE klasik memakai rata-rata karena jendelanya 10 tahun dan
 * mencakup siklus penuh; pada 4 tahun median jauh lebih tahan.
 *
 * BATAS YANG HARUS DIKETAHUI SEBELUM MEMBACA ANGKANYA:
 *
 * 1. Yahoo mengembalikan MAKSIMUM 5 periode tahunan, dan periode tertua kerap kosong -
 *    dalam praktiknya 4 tahun buku. Diminta dari 2010 pun hasilnya sama. Empat tahun
 *    BUKAN satu siklus batu bara/nikel (7-10 tahun); ini perkiraan daya laba jangka
 *    menengah, bukan through-cycle earnings yang sesungguhnya.
 * 2. Jendelanya BERGULIR. Ketika tahun puncak keluar dari jendela, "normal" ikut turun -
 *    artinya estimasi ini justru paling lemah beberapa tahun setelah puncak, saat seluruh
 *    jendela berisi tahun-tahun lemah. Itulah alasan tanda tangan PER/ROE lama TETAP
 *    dipertahankan sebagai lapisan kedua, bukan dibuang.
 * 3. Angkanya adalah laporan SEBAGAIMANA DIRESTATE HARI INI. Untuk penilaian live itu
 *    benar - kita memakai laporan masa lalu untuk menilai harga hari ini. Untuk backfill
 *    historis itu LOOK-AHEAD: laporan FY2024 baru terbit sekitar Maret 2025, dan angka
 *    yang direstate tidak pernah tersedia pada tanggal sinyal. Modul ini karena itu TIDAK
 *    dipakai `scripts/backfill-lens-history.mjs`, dan tidak boleh dipakai di sana tanpa
 *    lapisan jeda publikasi.
 * 4. Ekuitas yang dipakai adalah ekuitas AKHIR tahun, bukan rata-rata awal-akhir. Konvensi
 *    ROE yang lebih ketat memakai rata-rata; karena yang dibandingkan di sini adalah rasio
 *    antar tahun dengan perlakuan yang sama, biasnya saling meniadakan.
 */

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

/** Di bawah ini ROE normal tidak dihitung sama sekali. Tiga titik terlalu sedikit untuk
 * median yang bermakna, dan satu tahun aneh akan menggerakkannya terlalu jauh. */
export const NORMALIZED_EARNINGS_MIN_YEARS = 4;

/** Laporan tahunan berubah paling banyak sekali setahun; 7 hari sudah sangat konservatif. */
const CACHE_TTL_SEC = 7 * 24 * 60 * 60;

export interface AnnualRoeObservation {
  fiscalYear: number;
  netIncome: number;
  equity: number;
  roePct: number;
  /** Pendapatan tahun itu. `null` kalau Yahoo tidak memberikannya. */
  revenue: number | null;
  /** Margin operasi, persen. `null` untuk bank - mereka tidak melaporkan laba operasi
   * dalam pengertian yang sama, dan memaksakan angka di situ sama salahnya dengan
   * menilai bank lewat DER. */
  operatingMarginPct: number | null;
  /** Margin bersih, persen. */
  netMarginPct: number | null;
}

export interface NormalizedEarnings {
  source: 'YAHOO_FUNDAMENTALS_TIME_SERIES';
  years: number;
  firstFiscalYear: number;
  lastFiscalYear: number;
  /** Median ROE tahunan, persen. Inilah "normal" milik emiten itu sendiri. */
  normalizedRoePct: number;
  /** Rata-rata, dilaporkan berdampingan supaya selisihnya terhadap median terlihat. */
  meanRoePct: number;
  minRoePct: number;
  maxRoePct: number;
  observations: AnnualRoeObservation[];
  /** Batas jendela, dikirim ke UI apa adanya - bukan disembunyikan di komentar. */
  windowNote: string;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Inti perhitungan, murni dan bisa diuji tanpa jaringan.
 *
 * Tahun dengan ekuitas <= 0 DIBUANG, bukan diberi ROE besar bertanda apa pun: ROE dengan
 * penyebut negatif membalik tandanya dan angka yang dihasilkan tidak punya arti. Tahun
 * dengan laba negatif TETAP dipakai - tahun rugi adalah bagian sah dari sebuah siklus, dan
 * membuangnya akan menaikkan "normal" persis pada emiten yang paling siklikal.
 */
export function summarizeAnnualRoe(
  rows: Array<{
    fiscalYear: number;
    netIncome: number | null;
    equity: number | null;
    revenue?: number | null;
    operatingIncome?: number | null;
  }>,
): NormalizedEarnings | null {
  const observations: AnnualRoeObservation[] = [];
  const seen = new Set<number>();

  for (const row of rows) {
    if (!Number.isFinite(row.fiscalYear) || seen.has(row.fiscalYear)) continue;
    const { netIncome, equity } = row;
    if (typeof netIncome !== 'number' || !Number.isFinite(netIncome)) continue;
    if (typeof equity !== 'number' || !Number.isFinite(equity) || equity <= 0) continue;
    seen.add(row.fiscalYear);
    const revenue = typeof row.revenue === 'number' && Number.isFinite(row.revenue) && row.revenue > 0
      ? row.revenue
      : null;
    const operatingIncome = typeof row.operatingIncome === 'number' && Number.isFinite(row.operatingIncome)
      ? row.operatingIncome
      : null;
    observations.push({
      fiscalYear: row.fiscalYear,
      netIncome,
      equity,
      roePct: round((netIncome / equity) * 100),
      revenue,
      // Penyebut wajib pendapatan POSITIF - margin atas pendapatan nol/negatif tidak
      // punya arti, dan membiarkannya menghasilkan angka raksasa yang terlihat seperti
      // temuan.
      operatingMarginPct: revenue != null && operatingIncome != null
        ? round((operatingIncome / revenue) * 100)
        : null,
      netMarginPct: revenue != null ? round((netIncome / revenue) * 100) : null,
    });
  }

  if (observations.length < NORMALIZED_EARNINGS_MIN_YEARS) return null;

  observations.sort((a, b) => a.fiscalYear - b.fiscalYear);
  const roes = observations.map((o) => o.roePct);

  return {
    source: 'YAHOO_FUNDAMENTALS_TIME_SERIES',
    years: observations.length,
    firstFiscalYear: observations[0]!.fiscalYear,
    lastFiscalYear: observations[observations.length - 1]!.fiscalYear,
    normalizedRoePct: round(median(roes)),
    meanRoePct: round(roes.reduce((sum, v) => sum + v, 0) / roes.length),
    minRoePct: round(Math.min(...roes)),
    maxRoePct: round(Math.max(...roes)),
    observations,
    windowNote: `Median ROE ${observations.length} tahun buku (${observations[0]!.fiscalYear}-${observations[observations.length - 1]!.fiscalYear}). Yahoo hanya menyediakan maksimum 5 periode tahunan, jadi jendela ini lebih pendek dari satu siklus komoditas penuh dan ikut bergulir setiap tahun.`,
  };
}

type TimeSeriesRow = Record<string, unknown> & { date?: unknown };

function fiscalYearOf(row: TimeSeriesRow): number | null {
  const parsed = new Date(row.date as string | number | Date);
  const year = parsed.getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export interface NormalizedEarningsDeps {
  fetchFinancials?: (ticker: string) => Promise<TimeSeriesRow[]>;
  fetchBalanceSheet?: (ticker: string) => Promise<TimeSeriesRow[]>;
  cacheGet?: typeof cacheGet;
  cacheSet?: typeof cacheSet;
}

/**
 * Ambil dan ringkas ROE tahunan. `null` kalau tahun yang sah kurang dari minimum -
 * pemanggil WAJIB memperlakukannya sebagai "tidak diketahui", bukan sebagai "normal".
 *
 * Kegagalan jaringan juga menghasilkan `null`, bukan lemparan: modul ini melengkapi
 * penilaian dan tidak boleh menjatuhkan permintaan yang seluruh datanya sudah ada.
 */
export async function fetchNormalizedEarnings(
  rawTicker: string,
  deps: NormalizedEarningsDeps = {},
): Promise<NormalizedEarnings | null> {
  const ticker = rawTicker.toUpperCase().includes('.') ? rawTicker.toUpperCase() : `${rawTicker.toUpperCase()}.JK`;
  // v2: observasi kini membawa pendapatan & margin untuk pilar ketahanan moat.
  const cacheKey = `sahamlens:cache:computed:normalized-earnings:v2:${ticker}`;
  const get = deps.cacheGet ?? cacheGet;
  const set = deps.cacheSet ?? cacheSet;

  const cached = await get<NormalizedEarnings | null>(cacheKey);
  if (cached !== null && cached !== undefined) return cached;

  const period1 = '2010-01-01';
  const period2 = new Date().toISOString().slice(0, 10);
  const fetchFinancials = deps.fetchFinancials
    ?? ((t: string) => yahooFinance.fundamentalsTimeSeries(t, { period1, period2, type: 'annual', module: 'financials' }));
  const fetchBalanceSheet = deps.fetchBalanceSheet
    ?? ((t: string) => yahooFinance.fundamentalsTimeSeries(t, { period1, period2, type: 'annual', module: 'balance-sheet' }));

  let financials: TimeSeriesRow[];
  let balanceSheet: TimeSeriesRow[];
  try {
    [financials, balanceSheet] = await Promise.all([fetchFinancials(ticker), fetchBalanceSheet(ticker)]);
  } catch (error) {
    console.warn(`[NormalizedEarnings] gagal mengambil deret tahunan ${ticker}`, error);
    return null;
  }

  const equityByYear = new Map<number, number>();
  for (const row of balanceSheet ?? []) {
    const year = fiscalYearOf(row);
    if (year == null) continue;
    // `stockholdersEquity` adalah ekuitas induk; `totalEquityGrossMinorityInterest`
    // termasuk kepentingan non-pengendali. Laba yang dipakai di bawah adalah laba milik
    // pemegang saham induk, jadi ekuitas induk yang cocok - fallback hanya kalau tidak ada.
    const equity = numberOrNull(row.stockholdersEquity) ?? numberOrNull(row.totalEquityGrossMinorityInterest);
    if (equity != null) equityByYear.set(year, equity);
  }

  const rows = (financials ?? []).flatMap((row) => {
    const year = fiscalYearOf(row);
    if (year == null) return [];
    const netIncome = numberOrNull(row.netIncomeCommonStockholders) ?? numberOrNull(row.netIncome);
    return [{
      fiscalYear: year,
      netIncome,
      equity: equityByYear.get(year) ?? null,
      revenue: numberOrNull(row.totalRevenue) ?? numberOrNull(row.operatingRevenue),
      operatingIncome: numberOrNull(row.operatingIncome),
    }];
  });

  const summary = summarizeAnnualRoe(rows);
  // Hasil `null` ikut disimpan: emiten yang memang tidak punya 4 tahun data tidak boleh
  // memicu dua panggilan Yahoo pada setiap permintaan.
  await set(cacheKey, summary, CACHE_TTL_SEC);
  return summary;
}
