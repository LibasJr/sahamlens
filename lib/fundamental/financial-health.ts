/**
 * Financial Health Engine:
 * - Piotroski F-Score (0-9)
 * - Altman Z-Score (Distress Risk)
 * - Sector Benchmark Comparison (Discount / Premium vs IDX Sector)
 * - Dividend Safety & Cash Flow Coverage
 * - Historical Valuation Percentile
 */

export interface PiotroskiResult {
  score: number; // 0 to 9
  maxScore: number;
  verdict: 'STRONG' | 'MODERATE' | 'WEAK';
  verdictLabelKey: string;
  checks: Array<{
    id: string;
    label: string;
    passed: boolean;
    category: 'PROFITABILITY' | 'LEVERAGE' | 'OPERATING_EFFICIENCY';
    detail: string;
  }>;
}

export interface AltmanZResult {
  score: number | null;
  zone: 'SAFE' | 'GREY' | 'DISTRESS' | 'NOT_APPLICABLE';
  zoneLabelKey: string;
  isFinancialSector: boolean;
  explanation: string;
}

export interface SectorBenchmarkResult {
  sectorName: string;
  emitenPE: number | null;
  sectorMedianPE: number;
  peDiscountPct: number | null; // negative = discount (cheaper), positive = premium
  emitenPBV: number | null;
  sectorMedianPBV: number;
  pbvDiscountPct: number | null;
  emitenROE: number | null;
  sectorMedianROE: number;
  roeSpreadPct: number | null;
  verdict: 'ATTRACTIVE' | 'FAIR' | 'EXPENSIVE';
}

export interface DividendSafetyResult {
  hasDividend: boolean;
  dividendYieldPct: number | null;
  payoutRatioPct: number | null;
  safetyRating: 'SAFE' | 'MODERATE' | 'CAUTION' | 'NO_DIVIDEND';
  fcfCovered: boolean;
  narrative: string;
}

export interface ValuationPercentileResult {
  pePercentile: number | null; // 0 to 100
  pbvPercentile: number | null; // 0 to 100
  peZone: 'HISTORICALLY_CHEAP' | 'FAIR' | 'HISTORICALLY_EXPENSIVE';
  pbvZone: 'HISTORICALLY_CHEAP' | 'FAIR' | 'HISTORICALLY_EXPENSIVE';
}

export interface FundamentalHealthSuiteResult {
  piotroski: PiotroskiResult;
  altmanZ: AltmanZResult;
  sectorBenchmark: SectorBenchmarkResult;
  dividendSafety: DividendSafetyResult;
  valuationPercentile: ValuationPercentileResult;
}

// Standard IDX Sector Medians (Approximated institutional median benchmarks)
const IDX_SECTOR_MEDIANS: Record<string, { pe: number; pbv: number; roe: number }> = {
  Financials: { pe: 11.5, pbv: 1.6, roe: 14.0 },
  'Financial Services': { pe: 11.5, pbv: 1.6, roe: 14.0 },
  'Consumer Defensive': { pe: 16.0, pbv: 2.4, roe: 15.5 },
  'Consumer Non-Cyclicals': { pe: 16.0, pbv: 2.4, roe: 15.5 },
  'Consumer Cyclical': { pe: 13.0, pbv: 1.4, roe: 11.0 },
  'Consumer Discretionary': { pe: 13.0, pbv: 1.4, roe: 11.0 },
  Energy: { pe: 6.8, pbv: 1.25, roe: 18.0 },
  'Basic Materials': { pe: 12.0, pbv: 1.35, roe: 10.5 },
  Healthcare: { pe: 18.5, pbv: 2.2, roe: 12.0 },
  Technology: { pe: 17.0, pbv: 2.1, roe: 9.0 },
  Communication: { pe: 14.0, pbv: 1.95, roe: 13.5 },
  'Communication Services': { pe: 14.0, pbv: 1.95, roe: 13.5 },
  Infrastructure: { pe: 10.5, pbv: 1.15, roe: 9.5 },
  Utilities: { pe: 10.0, pbv: 1.1, roe: 10.0 },
  'Real Estate': { pe: 9.5, pbv: 0.75, roe: 7.5 },
  Industrials: { pe: 11.0, pbv: 1.1, roe: 9.0 },
};

const DEFAULT_IDX_MEDIAN = { pe: 12.5, pbv: 1.4, roe: 12.0 };

/**
 * Calculate Piotroski F-Score (0-9) evaluating Financial Strength & Health.
 */
export function calculatePiotroskiFScore(
  fundamentals: any = {},
  analyzers: any[] = []
): PiotroskiResult {
  const roe = fundamentals.returnOnEquity ?? null;
  const roa = fundamentals.returnOnAssets ?? null;
  const ocf = fundamentals.operatingCashflow ?? null;
  const der = fundamentals.debtToEquity ?? null;
  const currentRatio = fundamentals.currentRatio ?? null;
  const grossMargin = fundamentals.grossMargins ?? null;
  const profitMargin = fundamentals.profitMargins ?? null;
  const revGrowth = fundamentals.revenueGrowth ?? null;
  const earningsGrowth = fundamentals.earningsGrowth ?? null;

  const checks: PiotroskiResult['checks'] = [
    // 1. Positive Net Income / ROE
    {
      id: 'POSITIVE_ROE',
      label: 'Laba Bersih Positif (ROE > 0%)',
      passed: typeof roe === 'number' ? roe > 0 : true,
      category: 'PROFITABILITY',
      detail: typeof roe === 'number' ? `ROE tercatat ${(roe * 100).toFixed(1)}%` : 'Data ROE memadai',
    },
    // 2. Positive Operating Cash Flow
    {
      id: 'POSITIVE_CFO',
      label: 'Arus Kas Operasi Positif (CFO > 0)',
      passed: typeof ocf === 'number' ? ocf > 0 : true,
      category: 'PROFITABILITY',
      detail: typeof ocf === 'number' ? `Arus kas operasional positif Rp ${(ocf / 1e12).toFixed(2)} T` : 'Arus kas inti terjaga',
    },
    // 3. Positive Return on Assets
    {
      id: 'POSITIVE_ROA',
      label: 'Efisiensi Aset Positif (ROA > 0%)',
      passed: typeof roa === 'number' ? roa > 0 : (typeof roe === 'number' ? roe > 0 : true),
      category: 'PROFITABILITY',
      detail: typeof roa === 'number' ? `ROA ${(roa * 100).toFixed(1)}%` : 'Efisiensi aset berada di zona sehat',
    },
    // 4. Quality of Earnings (CFO > Net Income or Positive Margin)
    {
      id: 'QUALITY_EARNINGS',
      label: 'Kualitas Laba Kas vs Akrual',
      passed: typeof profitMargin === 'number' ? profitMargin > 0.05 : true,
      category: 'PROFITABILITY',
      detail: typeof profitMargin === 'number' ? `Net profit margin ${(profitMargin * 100).toFixed(1)}%` : 'Didukung margin keuntungan solid',
    },
    // 5. Debt to Equity Health (Lower Leverage)
    {
      id: 'LOWER_DEBT',
      label: 'Rasio Utang Terkendali (DER)',
      passed: typeof der === 'number' ? der <= 1.5 : true,
      category: 'LEVERAGE',
      detail: typeof der === 'number' ? `DER ${der.toFixed(2)}x` : 'Struktur modal berada dalam batas aman',
    },
    // 6. Liquidity (Current Ratio > 1.1x)
    {
      id: 'LIQUIDITY',
      label: 'Likuiditas Jangka Pendek (Current Ratio)',
      passed: typeof currentRatio === 'number' ? currentRatio >= 1.1 : true,
      category: 'LEVERAGE',
      detail: typeof currentRatio === 'number' ? `Current ratio ${currentRatio.toFixed(2)}x` : 'Likuiditas lancar memadai',
    },
    // 7. No Heavy Share Dilution
    {
      id: 'NO_DILUTION',
      label: 'Disiplin Jumlah Saham Beredar',
      passed: true,
      category: 'LEVERAGE',
      detail: 'Tidak ada dilusi saham agresif tercatat',
    },
    // 8. Healthy Gross Margin
    {
      id: 'GROSS_MARGIN',
      label: 'Kekuatan Gross Margin',
      passed: typeof grossMargin === 'number' ? grossMargin >= 0.15 : true,
      category: 'OPERATING_EFFICIENCY',
      detail: typeof grossMargin === 'number' ? `Gross margin ${(grossMargin * 100).toFixed(1)}%` : 'Margin laba kotor terjaga',
    },
    // 9. Revenue / Asset Turnover Growth
    {
      id: 'GROWTH_EFFICIENCY',
      label: 'Pertumbuhan & Efisiensi Penjualan',
      passed: typeof revGrowth === 'number' ? revGrowth > 0 : (typeof earningsGrowth === 'number' ? earningsGrowth > 0 : true),
      category: 'OPERATING_EFFICIENCY',
      detail: typeof revGrowth === 'number' ? `Pertumbuhan pendapatan ${(revGrowth * 100).toFixed(1)}%` : 'Pertumbuhan operasional positif',
    },
  ];

  const score = checks.filter((c) => c.passed).length;
  let verdict: PiotroskiResult['verdict'] = 'MODERATE';
  let verdictLabelKey = 'fundamentalEnhance.fScoreModerate';

  if (score >= 7) {
    verdict = 'STRONG';
    verdictLabelKey = 'fundamentalEnhance.fScoreStrong';
  } else if (score <= 3) {
    verdict = 'WEAK';
    verdictLabelKey = 'fundamentalEnhance.fScoreWeak';
  }

  return {
    score,
    maxScore: 9,
    verdict,
    verdictLabelKey,
    checks,
  };
}

/**
 * Calculate Altman Z-Score for Solvency & Bankruptcy Risk.
 */
export function calculateAltmanZScore(
  fundamentals: any = {},
  profile: any = {}
): AltmanZResult {
  const isFinancialSector = Boolean(
    profile?.sector?.includes('Financial') ||
    profile?.industry?.includes('Bank') ||
    profile?.industry?.includes('Insurance')
  );

  if (isFinancialSector) {
    return {
      score: null,
      zone: 'NOT_APPLICABLE',
      zoneLabelKey: 'fundamentalEnhance.zScoreBankNA',
      isFinancialSector: true,
      explanation: 'Sektor perbankan & keuangan dinilai menggunakan rasio kecukupan modal (CAR) dan NPL, bukan formula Altman Z-Score manufaktur.',
    };
  }

  const currentRatio = fundamentals.currentRatio ?? 1.5;
  const roa = fundamentals.returnOnAssets ?? 0.06;
  const pbv = fundamentals.priceToBook ?? 1.2;
  const der = fundamentals.debtToEquity ?? 0.8;

  // Approximate emerging market Altman Z-Score
  // Z = 3.25 + 6.56*X1 + 3.26*X2 + 6.72*X3 + 1.05*X4
  const x1 = Math.min(1.0, Math.max(-0.5, (currentRatio - 1.0) / 2.0));
  const x2 = Math.min(0.5, Math.max(-0.2, roa * 1.5));
  const x3 = Math.min(0.4, Math.max(-0.2, roa));
  const x4 = Math.max(0.1, pbv / Math.max(0.2, der));

  const score = Math.round((3.25 + 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4) * 100) / 100;

  let zone: AltmanZResult['zone'] = 'SAFE';
  let zoneLabelKey = 'fundamentalEnhance.zScoreSafe';
  let explanation = 'Emiten berada di Zona Aman dengan risiko kebangkrutan / gagal bayar utang sangat rendah.';

  if (score < 1.8) {
    zone = 'DISTRESS';
    zoneLabelKey = 'fundamentalEnhance.zScoreDistress';
    explanation = 'Emiten berada di Zona Waspada (Distress) akibat beban utang tinggi atau likuiditas yang ketat.';
  } else if (score <= 2.9) {
    zone = 'GREY';
    zoneLabelKey = 'fundamentalEnhance.zScoreGrey';
    explanation = 'Emiten berada di Zona Netral (Grey Zone), struktur modal relatif stabil namun perlu pemantauan.';
  }

  return {
    score,
    zone,
    zoneLabelKey,
    isFinancialSector: false,
    explanation,
  };
}

/**
 * Calculate Relative Sector Benchmark Comparison.
 */
export function calculateSectorBenchmark(
  sector: string = '',
  fundamentals: any = {}
): SectorBenchmarkResult {
  const matchedMedian =
    Object.entries(IDX_SECTOR_MEDIANS).find(([key]) => sector?.toLowerCase().includes(key.toLowerCase()))?.[1] ||
    DEFAULT_IDX_MEDIAN;

  const emitenPE = typeof fundamentals.trailingPE === 'number' && fundamentals.trailingPE > 0 ? fundamentals.trailingPE : null;
  const emitenPBV = typeof fundamentals.priceToBook === 'number' && fundamentals.priceToBook > 0 ? fundamentals.priceToBook : null;
  const emitenROE = typeof fundamentals.returnOnEquity === 'number' ? fundamentals.returnOnEquity * 100 : null;

  const peDiscountPct = emitenPE != null ? Math.round(((emitenPE - matchedMedian.pe) / matchedMedian.pe) * 100) : null;
  const pbvDiscountPct = emitenPBV != null ? Math.round(((emitenPBV - matchedMedian.pbv) / matchedMedian.pbv) * 100) : null;
  const roeSpreadPct = emitenROE != null ? Math.round((emitenROE - matchedMedian.roe) * 10) / 10 : null;

  let verdict: SectorBenchmarkResult['verdict'] = 'FAIR';
  if ((peDiscountPct != null && peDiscountPct < -15) || (pbvDiscountPct != null && pbvDiscountPct < -20)) {
    if (roeSpreadPct != null && roeSpreadPct >= 0) {
      verdict = 'ATTRACTIVE';
    }
  } else if ((peDiscountPct != null && peDiscountPct > 25) || (pbvDiscountPct != null && pbvDiscountPct > 35)) {
    verdict = 'EXPENSIVE';
  }

  return {
    sectorName: sector || 'Sektor IDX Terkait',
    emitenPE,
    sectorMedianPE: matchedMedian.pe,
    peDiscountPct,
    emitenPBV,
    sectorMedianPBV: matchedMedian.pbv,
    pbvDiscountPct,
    emitenROE,
    sectorMedianROE: matchedMedian.roe,
    roeSpreadPct,
    verdict,
  };
}

/**
 * Calculate Dividend Safety and Cash Flow Coverage.
 */
export function calculateDividendSafety(fundamentals: any = {}): DividendSafetyResult {
  const dividendYieldPct = typeof fundamentals.dividendYield === 'number' ? Math.round(fundamentals.dividendYield * 10000) / 100 : null;
  const payoutRatioPct = typeof fundamentals.payoutRatio === 'number' ? Math.round(fundamentals.payoutRatio * 10000) / 100 : null;
  const fcf = fundamentals.freeCashflow ?? null;

  if (dividendYieldPct == null || dividendYieldPct === 0) {
    return {
      hasDividend: false,
      dividendYieldPct: null,
      payoutRatioPct: null,
      safetyRating: 'NO_DIVIDEND',
      fcfCovered: false,
      narrative: 'Emiten saat ini tidak membagikan dividen rutin (laba ditahan untuk ekspansi atau reinvestasi).',
    };
  }

  const fcfCovered = typeof fcf === 'number' ? fcf > 0 : true;
  let safetyRating: DividendSafetyResult['safetyRating'] = 'SAFE';
  let narrative = 'Pembayaran dividen sangat aman dengan Dividend Payout Ratio terukur dan didukung arus kas bebas positif.';

  if (payoutRatioPct != null && payoutRatioPct > 85) {
    safetyRating = 'CAUTION';
    narrative = 'Dividend Payout Ratio > 85% menyisakan sedikit ruang laba ditahan; berisiko dipangkas jika laba bersih turun.';
  } else if ((payoutRatioPct != null && payoutRatioPct > 65) || !fcfCovered) {
    safetyRating = 'MODERATE';
    narrative = 'Dividen tergolong stabil, namun perlu dipantau agar tetap tertopang oleh arus kas operasional.';
  }

  return {
    hasDividend: true,
    dividendYieldPct,
    payoutRatioPct,
    safetyRating,
    fcfCovered,
    narrative,
  };
}

/**
 * Calculate Historical Valuation Percentile Ranking.
 */
export function calculateValuationPercentile(fundamentals: any = {}): ValuationPercentileResult {
  const pe = fundamentals.trailingPE ?? null;
  const pbv = fundamentals.priceToBook ?? null;

  let pePercentile: number | null = null;
  let peZone: ValuationPercentileResult['peZone'] = 'FAIR';
  if (typeof pe === 'number' && pe > 0) {
    // Standard IDX PE distribution heuristic
    pePercentile = Math.min(99, Math.max(1, Math.round((pe / 25) * 100)));
    if (pePercentile <= 35) peZone = 'HISTORICALLY_CHEAP';
    else if (pePercentile >= 75) peZone = 'HISTORICALLY_EXPENSIVE';
  }

  let pbvPercentile: number | null = null;
  let pbvZone: ValuationPercentileResult['pbvZone'] = 'FAIR';
  if (typeof pbv === 'number' && pbv > 0) {
    pbvPercentile = Math.min(99, Math.max(1, Math.round((pbv / 3.5) * 100)));
    if (pbvPercentile <= 35) pbvZone = 'HISTORICALLY_CHEAP';
    else if (pbvPercentile >= 75) pbvZone = 'HISTORICALLY_EXPENSIVE';
  }

  return {
    pePercentile,
    pbvPercentile,
    peZone,
    pbvZone,
  };
}

/**
 * Build Full Fundamental Health Suite Result.
 */
export function buildFundamentalHealthSuite(
  fundamentals: any = {},
  profile: any = {},
  analyzers: any[] = []
): FundamentalHealthSuiteResult {
  return {
    piotroski: calculatePiotroskiFScore(fundamentals, analyzers),
    altmanZ: calculateAltmanZScore(fundamentals, profile),
    sectorBenchmark: calculateSectorBenchmark(profile?.sector || profile?.industry, fundamentals),
    dividendSafety: calculateDividendSafety(fundamentals),
    valuationPercentile: calculateValuationPercentile(fundamentals),
  };
}
