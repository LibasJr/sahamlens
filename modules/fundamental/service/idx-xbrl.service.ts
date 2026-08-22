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
  /** Pos LANCAR - dasar current ratio. `null` untuk emiten yang neracanya memang tidak
   * diklasifikasikan lancar/tidak lancar, dan itu BUKAN kekurangan data: bank menyusun
   * neraca menurut likuiditas. Terukur TW1 2026: AALI & TLKM melaporkan keduanya, BBCA
   * tidak melaporkan satu pun tag lancar/tidak lancar. */
  currentAssets: number | null;
  currentLiabilities: number | null;
  /** Hanya dipakai untuk MEMVALIDASI pos lancar di atas (lancar + tidak lancar = total),
   * tidak masuk rasio mana pun. */
  nonCurrentAssets: number | null;
  nonCurrentLiabilities: number | null;
  revenue: number | null;
  profitLoss: number | null;
  profitLossAttributableToParent: number | null;
  profitLossBeforeIncomeTax: number | null;
  basicEps: number | null;
  /** Subtotal sisi kanan neraca yang DILAPORKAN EMITEN SENDIRI: Liabilitas + Dana
   * Syirkah Temporer + Ekuitas. Kalau ada, ini otoritas yang lebih tinggi daripada
   * menjumlah komponen sendiri - lihat checkBalanceSheet(). */
  liabilitiesSyirkahAndEquity: number | null;
  /** Modal saham dalam RUPIAH (bukan jumlah lembar - tidak ada tag jumlah lembar di
   * artefak IDX). Nilainya = jumlah lembar x nilai nominal, jadi ia berguna sebagai
   * KONFIRMASI SILANG independen atas jumlah lembar yang diturunkan dari EPS.
   * Lihat share-count.service.ts. */
  commonStocks: number | null;
}

export type IdxBalanceSheetBasis =
  /** Subtotal sisi kanan yang dilaporkan emiten sendiri. */
  | 'REPORTED_SUBTOTAL'
  /** Dijumlah dari Liabilitas + Dana Syirkah Temporer + Ekuitas. */
  | 'COMPONENT_SUM';

export interface IdxBalanceSheetCheck {
  assets: number | null;
  componentsSum: number | null;
  difference: number | null;
  /** null = tidak bisa diperiksa (ada komponen yang hilang), bukan "lolos". */
  balanced: boolean | null;
  /** Dari mana `componentsSum` berasal. `null` kalau tidak bisa diperiksa. */
  basis: IdxBalanceSheetBasis | null;
}

/** Hasil pemeriksaan satu sisi neraca: lancar + tidak lancar harus sama dengan totalnya. */
export interface IdxCurrentClassificationSide {
  total: number | null;
  componentsSum: number | null;
  difference: number | null;
  /** `null` = emiten tidak mengklasifikasikan sisi ini (wajar untuk bank), jadi tidak
   * bisa diperiksa - bukan gagal periksa. */
  balanced: boolean | null;
}

export interface IdxCurrentClassificationCheck {
  assets: IdxCurrentClassificationSide;
  liabilities: IdxCurrentClassificationSide;
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
    currentClassification: IdxCurrentClassificationCheck;
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
    currentAssets: factValue(artifact, 'CurrentAssets', instantCtx),
    currentLiabilities: factValue(artifact, 'CurrentLiabilities', instantCtx),
    nonCurrentAssets: factValue(artifact, 'NonCurrentAssets', instantCtx),
    nonCurrentLiabilities: factValue(artifact, 'NonCurrentLiabilities', instantCtx),
    revenue: firstFactValue(artifact, REVENUE_TAGS, durationCtx),
    profitLoss: factValue(artifact, 'ProfitLoss', durationCtx),
    profitLossAttributableToParent: factValue(artifact, 'ProfitLossAttributableToParentEntity', durationCtx),
    profitLossBeforeIncomeTax: factValue(artifact, 'ProfitLossBeforeIncomeTax', durationCtx),
    basicEps: factValue(artifact, 'BasicEarningsLossPerShareFromContinuingOperations', durationCtx),
    commonStocks: factValue(artifact, 'CommonStocks', instantCtx),
    liabilitiesSyirkahAndEquity: factValue(artifact, 'LiabilitiesTemporarySyirkahFundsAndEquity', instantCtx),
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
  if (!finite(assets)) {
    return { assets: null, componentsSum: null, difference: null, balanced: null, basis: null };
  }
  const tolerance = Math.abs(assets) * BALANCE_TOLERANCE_RATIO;

  // Kalau emiten melaporkan subtotal sisi kanannya sendiri, ITU yang dipakai. Menjumlah
  // komponen sendiri mengandaikan kita tahu semua pos yang berdiri di sisi kanan neraca
  // emiten itu - dan pengandaian itu terbukti salah pada data nyata TW1 2026: BSIM
  // menempatkan Rp 4.629.507.000.000 di `AccumulatedTabarrusFunds`, tag yang tidak kita
  // baca, sehingga penjumlahan komponen menuduhnya tidak seimbang padahal
  // `LiabilitiesTemporarySyirkahFundsAndEquity`-nya sama PERSIS dengan total aset.
  //
  // Terukur atas 285 emiten: 38 melaporkan subtotal ini, dan ke-38-nya sama persis
  // dengan Assets. Dua emiten yang dituduh tidak seimbang oleh penjumlahan komponen
  // (BSIM dan CASA) keduanya dibersihkan oleh subtotalnya sendiri.
  const reported = figures.liabilitiesSyirkahAndEquity;
  if (finite(reported)) {
    const difference = assets - reported;
    return {
      assets,
      componentsSum: reported,
      difference,
      balanced: Math.abs(difference) <= tolerance,
      basis: 'REPORTED_SUBTOTAL',
    };
  }

  if (!finite(liabilities) || !finite(equity)) {
    return { assets, componentsSum: null, difference: null, balanced: null, basis: null };
  }
  // Syirkah absen itu WAJAR untuk emiten non-syariah; diperlakukan nol HANYA di sini,
  // sebagai suku penjumlahan, bukan dilaporkan sebagai nilai terukur.
  const syirkah = figures.temporarySyirkahFunds ?? 0;
  const componentsSum = liabilities + syirkah + equity;
  const difference = assets - componentsSum;
  return {
    assets,
    componentsSum,
    difference,
    balanced: Math.abs(difference) <= tolerance,
    basis: 'COMPONENT_SUM',
  };
}

/**
 * Lancar + tidak lancar = total, diperiksa terpisah untuk sisi aset dan sisi liabilitas.
 *
 * Terverifikasi TW1 2026: AALI dan TLKM keduanya berselisih 0 rupiah di kedua sisi -
 * termasuk TLKM yang punya aset dimiliki-untuk-dijual, yang ternyata sudah termasuk di
 * dalam NonCurrentAssets dan bukan pos ketiga di luar identitas.
 *
 * BBCA tidak melaporkan satu pun tag lancar/tidak lancar, jadi kedua sisinya
 * `balanced: null`. Ini alasan gerbangnya ada: current ratio bank TIDAK BOLEH dihitung
 * dari total aset/liabilitas sebagai pengganti - angkanya akan terlihat wajar dan
 * sepenuhnya salah arti.
 */
function checkSide(total: number | null, current: number | null, nonCurrent: number | null): IdxCurrentClassificationSide {
  if (!finite(total) || !finite(current) || !finite(nonCurrent)) {
    return { total: total ?? null, componentsSum: null, difference: null, balanced: null };
  }
  const componentsSum = current + nonCurrent;
  const difference = total - componentsSum;
  const tolerance = Math.abs(total) * BALANCE_TOLERANCE_RATIO;
  return { total, componentsSum, difference, balanced: Math.abs(difference) <= tolerance };
}

function checkCurrentClassification(figures: IdxFinancialFigures): IdxCurrentClassificationCheck {
  return {
    assets: checkSide(figures.assets, figures.currentAssets, figures.nonCurrentAssets),
    liabilities: checkSide(figures.liabilities, figures.currentLiabilities, figures.nonCurrentLiabilities),
  };
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
  const currentClassification = checkCurrentClassification(current);
  const eps = checkEps(current);
  const rejected: string[] = [];

  if (eps.plausible === false) {
    current.basicEps = null;
    rejected.push(`current.basicEps: ${eps.rejectedReason}`);
  }

  // Pos lancar yang tidak lolos identitasnya sendiri di-null-kan, sepola dengan EPS:
  // current ratio dari komponen yang tidak menjumlah ke totalnya bukan angka yang
  // lebih baik daripada tidak ada angka.
  if (currentClassification.assets.balanced === false) {
    current.currentAssets = null;
    rejected.push(
      `current.currentAssets: lancar + tidak lancar = ${currentClassification.assets.componentsSum}, `
      + `total aset ${currentClassification.assets.total} (selisih ${currentClassification.assets.difference}).`,
    );
  }
  if (currentClassification.liabilities.balanced === false) {
    current.currentLiabilities = null;
    rejected.push(
      `current.currentLiabilities: lancar + tidak lancar = ${currentClassification.liabilities.componentsSum}, `
      + `total liabilitas ${currentClassification.liabilities.total} (selisih ${currentClassification.liabilities.difference}).`,
    );
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
    integrity: { balanceSheet, currentClassification, eps, rejected },
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
