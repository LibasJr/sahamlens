/**
 * Lima dimensi kesehatan fundamental dalam bahasa biasa.
 *
 * KENAPA ADA (redesign v2, PRD §20): halaman /fundamental membuka dengan tiga belas
 * kartu analyzer. Semuanya benar, tetapi pertanyaan pertama pembaca bukan "berapa
 * DER-nya" melainkan "bisnis ini sehat atau tidak". Modul ini menjawab itu lebih dulu,
 * lalu kartu-kartu di bawahnya menjadi buktinya.
 *
 * AMBANG BATAS SENGAJA MENYALIN ANALYZER YANG SUDAH ADA
 * (`modules/fundamental/service/analyzers/*.ts`), bukan membuat set kedua. Kalau
 * ringkasan di atas memakai ambang sendiri, satu emiten bisa terbaca "Profitabilitas
 * kuat" di kepala halaman dan "ROE BEARISH" di kartu tepat di bawahnya - persis jenis
 * kontradiksi yang membuat pengguna berhenti mempercayai angkanya. Kalau ambang di
 * analyzer berubah, ubah juga di sini; test di __tests__/health-summary.test.ts
 * memeriksa keduanya tetap sepakat pada kasus batas.
 *
 * SATUAN (mudah salah, sudah pernah salah di tempat lain):
 *   returnOnEquity, profitMargins, revenueGrowth, earningsGrowth = PECAHAN (0.15 = 15%)
 *   debtToEquity                                                 = PERSEN (100 = 1.0x)
 *   currentRatio                                                 = KALI  (1.5 = 1.5x)
 *
 * Tidak ada nilai yang dikarang. Input yang hilang menghasilkan verdict 'UNKNOWN',
 * bukan angka nol dan bukan verdict netral - "belum ada datanya" adalah jawaban yang
 * berbeda dari "biasa saja".
 */

export type HealthVerdict = 'STRONG' | 'MODERATE' | 'WEAK' | 'CAUTION' | 'UNKNOWN';

export interface HealthDimension {
  id: 'profitability' | 'growth' | 'balanceSheet' | 'cashFlow' | 'valuation';
  /** Label Indonesia (halaman ini berbahasa Indonesia; en ditangani pemanggil). */
  label: string;
  labelEn: string;
  verdict: HealthVerdict;
  /** Ringkas verdict dalam satu kata untuk pembaca. */
  verdictLabel: string;
  verdictLabelEn: string;
  /** Angka yang dipakai, apa adanya - inilah "evidence" di balik verdict. */
  evidence: string;
}

export interface FundamentalHealthInput {
  returnOnEquity?: number | null;
  profitMargins?: number | null;
  revenueGrowth?: number | null;
  earningsGrowth?: number | null;
  debtToEquity?: number | null;
  currentRatio?: number | null;
  operatingCashflow?: number | null;
  freeCashflow?: number | null;
}

const VERDICT_LABEL: Record<HealthVerdict, { id: string; en: string }> = {
  STRONG: { id: 'Kuat', en: 'Strong' },
  MODERATE: { id: 'Moderat', en: 'Moderate' },
  WEAK: { id: 'Lemah', en: 'Weak' },
  CAUTION: { id: 'Perlu dicermati', en: 'Needs attention' },
  UNKNOWN: { id: 'Data belum cukup', en: 'Not enough data' },
};

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Gabungkan beberapa penilaian sub-metrik menjadi satu verdict dimensi.
 *  Aturannya sengaja konservatif: satu sinyal lemah menurunkan seluruh dimensi, karena
 *  ringkasan yang menyembunyikan satu-satunya angka buruk tidak menolong siapa pun. */
function combine(parts: HealthVerdict[]): HealthVerdict {
  const known = parts.filter((part) => part !== 'UNKNOWN');
  if (known.length === 0) return 'UNKNOWN';
  if (known.includes('WEAK')) return 'WEAK';
  if (known.includes('CAUTION')) return 'CAUTION';
  return known.every((part) => part === 'STRONG') ? 'STRONG' : 'MODERATE';
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Ambang identik roe-analyzer.ts: >15% bullish, <5% bearish. */
function judgeRoe(roe: number | null | undefined): HealthVerdict {
  if (!isNum(roe)) return 'UNKNOWN';
  const roePct = roe * 100;
  if (roePct > 15) return 'STRONG';
  if (roePct < 5) return 'WEAK';
  return 'MODERATE';
}

/** Ambang identik net-margin-analyzer.ts: >15% bullish, <5% bearish. */
function judgeMargin(margin: number | null | undefined): HealthVerdict {
  if (!isNum(margin)) return 'UNKNOWN';
  const marginPct = margin * 100;
  if (marginPct > 15) return 'STRONG';
  if (marginPct < 5) return 'WEAK';
  return 'MODERATE';
}

/** Ambang identik revenue-growth-analyzer.ts & eps-growth-analyzer.ts: >10% bullish, <0 bearish. */
function judgeGrowth(growth: number | null | undefined): HealthVerdict {
  if (!isNum(growth)) return 'UNKNOWN';
  const growthPct = growth * 100;
  if (growthPct > 10) return 'STRONG';
  if (growthPct < 0) return 'WEAK';
  return 'MODERATE';
}

/** Ambang identik der-analyzer.ts: >200 (2.0x) bearish, <100 (1.0x) bullish. */
function judgeDer(der: number | null | undefined): HealthVerdict {
  if (!isNum(der)) return 'UNKNOWN';
  if (der > 200) return 'WEAK';
  if (der < 100) return 'STRONG';
  return 'MODERATE';
}

/** Ambang identik current-ratio-analyzer.ts: >1.5 bullish, <1 bearish. */
function judgeCurrentRatio(ratio: number | null | undefined): HealthVerdict {
  if (!isNum(ratio)) return 'UNKNOWN';
  if (ratio > 1.5) return 'STRONG';
  if (ratio < 1) return 'WEAK';
  return 'MODERATE';
}

/**
 * Arus kas tidak punya analyzer sendiri di suite fundamental, jadi aturannya ditulis di
 * sini dan sengaja dibuat kasar: tanda, bukan besaran. Operating cash flow negatif berarti
 * bisnis intinya membakar kas; FCF negatif dengan OCF positif berarti belanja modalnya
 * lebih besar dari kas operasi - bisa ekspansi sehat, bisa juga tekanan, jadi 'CAUTION'
 * dan bukan 'WEAK'.
 */
function judgeCashFlow(ocf: number | null | undefined, fcf: number | null | undefined): HealthVerdict {
  if (!isNum(ocf)) return 'UNKNOWN';
  if (ocf <= 0) return 'WEAK';
  if (!isNum(fcf)) return 'MODERATE';
  return fcf > 0 ? 'STRONG' : 'CAUTION';
}

/**
 * Verdict valuasi TIDAK dihitung ulang di sini. `consensus` adalah hasil vote 13 analyzer
 * di server (modules/fundamental/service/consensus-labels.service.ts). Pendapat valuasi
 * kedua yang dihitung di browser hanya akan menjadi angka yang bertentangan dengan label
 * di kartu sebelahnya.
 */
function judgeValuation(consensus: string | null | undefined): HealthVerdict {
  const text = (consensus || '').toUpperCase();
  if (!text) return 'UNKNOWN';
  if (text.includes('UNDERVALUED')) return 'STRONG';
  if (text.includes('OVERVALUED')) return 'CAUTION';
  if (text.includes('FAIR')) return 'MODERATE';
  return 'UNKNOWN';
}

function label(verdict: HealthVerdict): { verdictLabel: string; verdictLabelEn: string } {
  return { verdictLabel: VERDICT_LABEL[verdict].id, verdictLabelEn: VERDICT_LABEL[verdict].en };
}

const NO_DATA = { id: 'Angka belum tersedia dari sumber data', en: 'Source data does not provide the figures yet' };

export function buildFundamentalHealthSummary(
  fundamentals: FundamentalHealthInput | null | undefined,
  consensus: string | null | undefined,
  options: { isBank?: boolean } = {},
): HealthDimension[] {
  const f = fundamentals || {};
  const isBank = Boolean(options.isBank);

  const profitability = combine([judgeRoe(f.returnOnEquity), judgeMargin(f.profitMargins)]);
  const growth = combine([judgeGrowth(f.revenueGrowth), judgeGrowth(f.earningsGrowth)]);
  // Bank dikecualikan dari DER & current ratio, bukan disamarkan: neraca bank memang
  // didominasi dana pihak ketiga, jadi DER tinggi adalah model bisnisnya - bukan tanda
  // bahaya. Ukuran yang benar (CAR, NPL, LDR) sudah tampil di blok rasio khusus bank di
  // halaman yang sama, dan itulah yang ditunjuk teks di bawah.
  const balanceSheet = isBank ? 'UNKNOWN' : combine([judgeDer(f.debtToEquity), judgeCurrentRatio(f.currentRatio)]);
  const cashFlow = judgeCashFlow(f.operatingCashflow, f.freeCashflow);
  const valuation = judgeValuation(consensus);

  const roeText = isNum(f.returnOnEquity) ? `ROE ${pct(f.returnOnEquity)}` : null;
  const marginText = isNum(f.profitMargins) ? `net margin ${pct(f.profitMargins)}` : null;
  const revenueText = isNum(f.revenueGrowth) ? `pendapatan ${pct(f.revenueGrowth)} YoY` : null;
  const earningsText = isNum(f.earningsGrowth) ? `laba ${pct(f.earningsGrowth)} YoY` : null;
  const derText = isNum(f.debtToEquity) ? `DER ${(f.debtToEquity / 100).toFixed(2)}x` : null;
  const currentText = isNum(f.currentRatio) ? `current ratio ${f.currentRatio.toFixed(2)}x` : null;
  const cashText = isNum(f.operatingCashflow)
    ? `arus kas operasi ${f.operatingCashflow > 0 ? 'positif' : 'negatif'}${isNum(f.freeCashflow) ? `, FCF ${f.freeCashflow > 0 ? 'positif' : 'negatif'}` : ''}`
    : null;

  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(' · ');

  return [
    {
      id: 'profitability',
      label: 'Profitabilitas',
      labelEn: 'Profitability',
      verdict: profitability,
      ...label(profitability),
      evidence: join(roeText, marginText) || NO_DATA.id,
    },
    {
      id: 'growth',
      label: 'Pertumbuhan',
      labelEn: 'Growth',
      verdict: growth,
      ...label(growth),
      evidence: join(revenueText, earningsText) || NO_DATA.id,
    },
    {
      id: 'balanceSheet',
      label: 'Neraca',
      labelEn: 'Balance Sheet',
      verdict: balanceSheet,
      ...label(balanceSheet),
      evidence: isBank
        ? 'DER & current ratio tidak dipakai untuk bank - lihat CAR, NPL, dan LDR di blok rasio khusus bank'
        : join(derText, currentText) || NO_DATA.id,
    },
    {
      id: 'cashFlow',
      label: 'Arus kas',
      labelEn: 'Cash Flow',
      verdict: cashFlow,
      ...label(cashFlow),
      evidence: cashText || NO_DATA.id,
    },
    {
      id: 'valuation',
      label: 'Valuasi',
      labelEn: 'Valuation',
      verdict: valuation,
      ...label(valuation),
      evidence: consensus ? `Konsensus 13 analyzer: ${consensus}` : NO_DATA.id,
    },
  ];
}
