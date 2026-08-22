import fs from 'node:fs';
import path from 'node:path';

/**
 * Pembacaan LAPORAN KEUANGAN RESMI BEI (XBRL) - sumber langsung dari bursa, bukan Yahoo.
 *
 * Artefaknya ditulis oleh scripts/sync-idx-financial-reports.py (pola sama dengan
 * foreign-flow: Python mengunduh & menormalkan secara mekanis, TypeScript menafsirkan
 * dan diuji dengan vitest). File ini memegang LOGIKA BISNIS-nya: memetakan taksonomi
 * IDX ke field yang dipakai SahamLens, dan - ini bagian terpentingnya - MEMVALIDASI
 * angkanya sebelum dipercaya.
 *
 * ===================================================================================
 * KENAPA VALIDASI WAJIB: DATA RESMI TIDAK BERARTI DATA BENAR
 * ===================================================================================
 * Terukur pada TW1 2026 saat fitur ini dibangun (2026-08-22):
 *
 *   AALI  BasicEarningsLossPerShare = 194,01        wajar
 *   BBCA  BasicEarningsLossPerShare = 119           wajar
 *   TLKM  BasicEarningsLossPerShare = 0,0000000439  MUSTAHIL
 *
 * TLKM melaporkan laba bersih induk Rp 4,344 triliun. Dengan ~99 miliar lembar saham,
 * EPS yang benar sekitar Rp 44 - nilai yang dilaporkan meleset TEPAT 1e9.
 *
 * Yang membuat ini berbahaya: metadata XBRL TIDAK menolongnya sama sekali. Ketiga emiten
 * memakai unit yang IDENTIK (`IDRPerShares` = iso4217:IDR / shares) dan `decimals="INF"`.
 * Jadi ini bukan perbedaan skala yang bisa dinormalkan - ini salah input oleh emitennya
 * sendiri di SPT XBRL yang ia serahkan ke bursa. Memetakan angka itu mentah-mentah akan
 * menyuntikkan EPS palsu ke SahamLens, dan tidak ada satu pun tanda di layar bahwa ia
 * salah.
 *
 * Karena itu setiap field yang bisa diperiksa, DIPERIKSA. Yang gagal periksa menjadi
 * `null` beserta alasannya (fail-closed, sesuai temuan C-7), bukan diteruskan diam-diam.
 */

// ── Bentuk artefak mentah dari scraper ────────────────────────────────────────────

export interface IdxXbrlContext {
  instant?: string;
  startDate?: string;
  endDate?: string;
}

export interface IdxXbrlArtifact {
  schemaVersion: number;
  ticker: string;
  entityName: string | null;
  year: number;
  period: string;
  fileModified: string | null;
  fetchedAt: string;
  sourceUrl: string;
  contexts: Record<string, IdxXbrlContext>;
  /** `{tagLengkap: {contextId: nilaiMentahSebagaiString}}` - string, lihat catatan
   * presisi di scripts/sync-idx-financial-reports.py. */
  facts: Record<string, Record<string, string>>;
  dimensionalContextCount: number;
  dimensionalFactsSkipped: number;
  unexpectedPlainContexts: string[];
}

// ── Hasil pemetaan ────────────────────────────────────────────────────────────────

export type IdxPeriodKey = 'current' | 'prior';

export interface IdxFinancialFigures {
  assets: number | null;
  liabilities: number | null;
  /** Dana syirkah temporer - nol/absen untuk emiten non-syariah. Ikut ke identitas
   * neraca karena bank dengan unit syariah menempatkannya TERPISAH dari liabilitas. */
  temporarySyirkahFunds: number | null;
  equity: number | null;
  equityAttributableToParent: number | null;
  revenue: number | null;
  profitLoss: number | null;
  profitLossAttributableToParent: number | null;
  profitLossBeforeIncomeTax: number | null;
  basicEps: number | null;
}

export interface IdxBalanceSheetCheck {
  assets: number | null;
  componentsSum: number | null;
  difference: number | null;
  /** null = tidak bisa diperiksa (ada komponen yang hilang), bukan "lolos". */
  balanced: boolean | null;
}

export interface IdxEpsCheck {
  reported: number | null;
  /** laba induk / EPS - harus mendarat di kisaran jumlah lembar saham yang masuk akal. */
  impliedShares: number | null;
  plausible: boolean | null;
  rejectedReason: string | null;
}

export interface IdxFinancialReport {
  ticker: string;
  entityName: string | null;
  year: number;
  period: string;
  /** Waktu emiten menyerahkan/memperbarui berkas di BEI - ini stempel point-in-time
   * yang SUNGGUHAN, keunggulan utama sumber ini dibanding Yahoo (yang bisa me-restate
   * angka historis diam-diam). */
  fileModified: string | null;
  sourceUrl: string;
  periodEnd: string | null;
  priorPeriodEnd: string | null;
  current: IdxFinancialFigures;
  prior: IdxFinancialFigures;
  integrity: {
    balanceSheet: IdxBalanceSheetCheck;
    eps: IdxEpsCheck;
    /** Field yang di-null-kan oleh validasi, beserta alasannya. Dilaporkan supaya
     * "tidak ada angka" tidak pernah tertukar dengan "angkanya nol". */
    rejected: string[];
  };
}

// ── Taksonomi ─────────────────────────────────────────────────────────────────────

const NS = 'idx-cor:';

/**
 * Pendapatan adalah SATU-SATUNYA pos utama yang tag-nya berbeda menurut sektor.
 * Terverifikasi pada TW1 2026: AALI & TLKM memakai `SalesAndRevenue`, sementara BBCA
 * (bank) tidak punya tag itu sama sekali dan memakai `InterestIncome`. Urutan di bawah
 * adalah prioritas: yang pertama ditemukan dipakai.
 *
 * Pos lain (Assets/Liabilities/Equity/ProfitLoss/EPS) ternyata SERAGAM lintas sektor,
 * jadi tidak perlu tabel per-sektor - dan tidak dibuat-buat seolah perlu.
 */
const REVENUE_TAGS = [
  'SalesAndRevenue',
  'RevenueFromContractsWithCustomers',
  'Revenue',
  // Bank & lembaga keuangan
  'InterestIncome',
  'InterestAndShariaIncome',
] as const;

/** Kisaran jumlah lembar saham yang masuk akal di IDX. Batasnya sengaja SANGAT longgar
 * (emiten terkecil ~1e7, terbesar ~1e12-1e13) - penjaga ini untuk menangkap kesalahan
 * yang meleset beberapa ORDE seperti TLKM (9,9e19), bukan untuk menghakimi emiten yang
 * jumlah sahamnya tidak biasa. */
const MIN_PLAUSIBLE_SHARES = 1e6;
const MAX_PLAUSIBLE_SHARES = 1e13;

/** Identitas neraca dibandingkan relatif terhadap total aset, bukan absolut: nilai
 * rupiah penuh berada di orde 1e15 dan pembulatan pelaporan bisa menyisakan selisih
 * beberapa rupiah tanpa berarti laporannya tidak seimbang. */
const BALANCE_TOLERANCE_RATIO = 1e-9;

// ── Utilitas ──────────────────────────────────────────────────────────────────────

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** String -> number dengan penjagaan. Nilai kosong/bukan angka menghasilkan `null`,
 * BUKAN 0 - "tidak dilaporkan" dan "dilaporkan nol" adalah dua hal berbeda. */
function toNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function factValue(artifact: IdxXbrlArtifact, tag: string, contextId: string): number | null {
  return toNumber(artifact.facts[NS + tag]?.[contextId]);
}

function firstFactValue(artifact: IdxXbrlArtifact, tags: readonly string[], contextId: string): number | null {
  for (const tag of tags) {
    const value = factValue(artifact, tag, contextId);
    if (value != null) return value;
  }
  return null;
}

// ── Pemetaan ──────────────────────────────────────────────────────────────────────

function readFigures(artifact: IdxXbrlArtifact, instantCtx: string, durationCtx: string): IdxFinancialFigures {
  return {
    assets: factValue(artifact, 'Assets', instantCtx),
    liabilities: factValue(artifact, 'Liabilities', instantCtx),
    temporarySyirkahFunds: factValue(artifact, 'TemporarySyirkahFunds', instantCtx),
    equity: factValue(artifact, 'Equity', instantCtx),
    equityAttributableToParent: factValue(artifact, 'EquityAttributableToEquityOwnersOfParentEntity', instantCtx),
    revenue: firstFactValue(artifact, REVENUE_TAGS, durationCtx),
    profitLoss: factValue(artifact, 'ProfitLoss', durationCtx),
    profitLossAttributableToParent: factValue(artifact, 'ProfitLossAttributableToParentEntity', durationCtx),
    profitLossBeforeIncomeTax: factValue(artifact, 'ProfitLossBeforeIncomeTax', durationCtx),
    basicEps: factValue(artifact, 'BasicEarningsLossPerShareFromContinuingOperations', durationCtx),
  };
}

/**
 * Aset = Liabilitas + Dana Syirkah Temporer + Ekuitas.
 *
 * Terverifikasi TW1 2026: AALI selisih 0, TLKM selisih 0, dan BBCA selisih
 * Rp 11.111.526.000.000 yang PERSIS sama dengan `TemporarySyirkahFunds`-nya. Tanpa suku
 * syirkah, setiap bank dengan unit syariah akan salah dinyatakan "tidak seimbang".
 *
 * Mengembalikan `balanced: null` (bukan `false`) kalau ada komponen yang tidak
 * dilaporkan - tidak bisa diperiksa bukan berarti gagal periksa.
 */
function checkBalanceSheet(figures: IdxFinancialFigures): IdxBalanceSheetCheck {
  const { assets, liabilities, equity } = figures;
  // Syirkah absen itu WAJAR untuk emiten non-syariah; diperlakukan nol HANYA di sini,
  // sebagai suku penjumlahan, bukan dilaporkan sebagai nilai terukur.
  const syirkah = figures.temporarySyirkahFunds ?? 0;
  if (!finite(assets) || !finite(liabilities) || !finite(equity)) {
    return { assets: assets ?? null, componentsSum: null, difference: null, balanced: null };
  }
  const componentsSum = liabilities + syirkah + equity;
  const difference = assets - componentsSum;
  const tolerance = Math.abs(assets) * BALANCE_TOLERANCE_RATIO;
  return { assets, componentsSum, difference, balanced: Math.abs(difference) <= tolerance };
}

/**
 * EPS diperiksa lewat jumlah lembar saham yang tersirat darinya: laba induk / EPS.
 * Kalau hasilnya jatuh di luar kisaran wajar IDX, EPS-nya yang salah - dan kita TIDAK
 * "memperbaikinya" dengan mengalikan 1e9 atau menebak faktor koreksi, karena menebak
 * skala berarti mengarang angka. EPS-nya di-null-kan dan alasannya dicatat.
 */
function checkEps(figures: IdxFinancialFigures): IdxEpsCheck {
  const eps = figures.basicEps;
  const netIncome = figures.profitLossAttributableToParent ?? figures.profitLoss;

  if (!finite(eps) || eps === 0) {
    return { reported: eps ?? null, impliedShares: null, plausible: null, rejectedReason: null };
  }
  if (!finite(netIncome) || netIncome === 0) {
    return { reported: eps, impliedShares: null, plausible: null, rejectedReason: null };
  }

  const impliedShares = netIncome / eps;
  // Tanda negatif hanya berarti rugi; yang dinilai kewajarannya adalah besarannya.
  const magnitude = Math.abs(impliedShares);
  const plausible = magnitude >= MIN_PLAUSIBLE_SHARES && magnitude <= MAX_PLAUSIBLE_SHARES;

  return {
    reported: eps,
    impliedShares,
    plausible,
    rejectedReason: plausible
      ? null
      : `EPS ${eps} menyiratkan ${magnitude.toExponential(3)} lembar saham, di luar kisaran wajar IDX `
        + `(${MIN_PLAUSIBLE_SHARES.toExponential(0)}..${MAX_PLAUSIBLE_SHARES.toExponential(0)}). `
        + 'Kemungkinan salah skala pada pelaporan XBRL emiten; nilainya tidak dipakai dan tidak dikoreksi otomatis.',
  };
}

export function mapIdxFinancialReport(artifact: IdxXbrlArtifact): IdxFinancialReport {
  const current = readFigures(artifact, 'CurrentYearInstant', 'CurrentYearDuration');
  const prior = readFigures(artifact, 'PriorEndYearInstant', 'PriorYearDuration');

  const balanceSheet = checkBalanceSheet(current);
  const eps = checkEps(current);
  const rejected: string[] = [];

  if (eps.plausible === false) {
    current.basicEps = null;
    rejected.push(`current.basicEps: ${eps.rejectedReason}`);
  }

  return {
    ticker: artifact.ticker,
    entityName: artifact.entityName,
    year: artifact.year,
    period: artifact.period,
    fileModified: artifact.fileModified,
    sourceUrl: artifact.sourceUrl,
    periodEnd: artifact.contexts.CurrentYearInstant?.instant ?? null,
    priorPeriodEnd: artifact.contexts.PriorEndYearInstant?.instant ?? null,
    current,
    prior,
    integrity: { balanceSheet, eps, rejected },
  };
}

// ── Pembacaan artefak ─────────────────────────────────────────────────────────────

// Kode emiten IDX selalu 4 huruf. Pola ketat ini sekaligus mencegah path traversal -
// nama berkas dibentuk dari input pemanggil (pola sama dengan idx-foreign-flow.service.ts).
const TICKER_PATTERN = /^[A-Z]{4}$/;
const PERIOD_PATTERN = /^(?:TW[1-4]|AUDIT)$/;

export interface ReadIdxFinancialOptions {
  /** Folder artefak. Default `<cwd>/data/idx-financial`. Diisi eksplisit oleh test. */
  dataDir?: string;
}

function defaultDataDir(): string {
  return path.join(process.cwd(), 'data', 'idx-financial');
}

export function readIdxFinancialArtifact(
  ticker: string,
  year: number,
  period: string,
  options: ReadIdxFinancialOptions = {},
): IdxXbrlArtifact | null {
  const code = String(ticker || '').trim().toUpperCase().replace(/\.JK$/, '');
  const periodKey = String(period || '').trim().toUpperCase();
  if (!TICKER_PATTERN.test(code) || !PERIOD_PATTERN.test(periodKey)) return null;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;

  const file = path.join(options.dataDir ?? defaultDataDir(), `${code}-${year}-${periodKey}.json`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // Berkas tidak ada = emiten belum melaporkan periode itu. Itu keadaan yang SAH dan
    // dilaporkan sebagai null, bukan galat.
    return null;
  }
  const artifact = parsed as IdxXbrlArtifact;
  if (!artifact || typeof artifact !== 'object' || !artifact.facts || !artifact.contexts) return null;
  return artifact;
}

export function readIdxFinancialReport(
  ticker: string,
  year: number,
  period: string,
  options: ReadIdxFinancialOptions = {},
): IdxFinancialReport | null {
  const artifact = readIdxFinancialArtifact(ticker, year, period, options);
  return artifact ? mapIdxFinancialReport(artifact) : null;
}
