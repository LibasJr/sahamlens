/**
 * Financial Health Engine — ZERO DUMMY POLICY.
 *
 * Aturan: metrik yang membutuhkan data historis/peer tidak boleh diisi dengan median,
 * asumsi, atau nilai default hardcoded. Jika input yang dibutuhkan belum tersedia,
 * hasil tetap null / DATA_UNAVAILABLE.
 */

export interface PiotroskiCheck {
  id: string;
  label: string;
  passed: boolean | null;
  category: 'PROFITABILITY' | 'LEVERAGE' | 'OPERATING_EFFICIENCY';
  detail: string;
}

export interface PiotroskiResult {
  score: number | null;
  maxScore: number;
  availableChecks: number;
  verdict: 'STRONG' | 'MODERATE' | 'WEAK' | 'DATA_UNAVAILABLE';
  verdictLabelKey: string;
  checks: PiotroskiCheck[];
}

export interface AltmanZResult {
  score: number | null;
  zone: 'SAFE' | 'GREY' | 'DISTRESS' | 'NOT_APPLICABLE' | 'DATA_UNAVAILABLE';
  zoneLabelKey: string;
  isFinancialSector: boolean;
  explanation: string;
}

export interface SectorBenchmarkResult {
  sectorName: string;
  emitenPE: number | null;
  sectorMedianPE: number | null;
  peDiscountPct: number | null;
  emitenPBV: number | null;
  sectorMedianPBV: number | null;
  pbvDiscountPct: number | null;
  emitenROE: number | null;
  sectorMedianROE: number | null;
  roeSpreadPct: number | null;
  verdict: 'ATTRACTIVE' | 'FAIR' | 'EXPENSIVE' | 'DATA_UNAVAILABLE';
  source: string | null;
}

export interface DividendSafetyResult {
  hasDividend: boolean | null;
  dividendYieldPct: number | null;
  payoutRatioPct: number | null;
  safetyRating: 'SAFE' | 'MODERATE' | 'CAUTION' | 'NO_DIVIDEND' | 'DATA_PARTIAL' | 'DATA_UNAVAILABLE';
  fcfPositive: boolean | null;
  methodology: 'SCREENING_HEURISTIC' | 'UNAVAILABLE';
  narrative: string;
}

export interface ValuationPercentileResult {
  pePercentile: number | null;
  pbvPercentile: number | null;
  peSampleSize: number;
  pbvSampleSize: number;
  peZone: 'HISTORICALLY_CHEAP' | 'FAIR' | 'HISTORICALLY_EXPENSIVE' | 'DATA_UNAVAILABLE';
  pbvZone: 'HISTORICALLY_CHEAP' | 'FAIR' | 'HISTORICALLY_EXPENSIVE' | 'DATA_UNAVAILABLE';
}

export interface FundamentalHealthSuiteResult {
  piotroski: PiotroskiResult;
  altmanZ: AltmanZResult;
  sectorBenchmark: SectorBenchmarkResult;
  dividendSafety: DividendSafetyResult;
  valuationPercentile: ValuationPercentileResult;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function check(
  id: string,
  label: string,
  category: PiotroskiCheck['category'],
  passed: boolean | null,
  detail: string,
): PiotroskiCheck {
  return { id, label, category, passed, detail };
}

function unavailableDetail(): string {
  return 'Data yang dibutuhkan untuk kriteria ini belum tersedia.';
}

/**
 * Piotroski F-Score resmi membutuhkan data periode sekarang DAN periode sebelumnya.
 * SahamLens tidak boleh mengganti data historis yang hilang dengan proxy current snapshot.
 * Score hanya diterbitkan bila seluruh 9 kriteria benar-benar dapat dievaluasi.
 */
export function calculatePiotroskiFScore(fundamentals: any = {}, _analyzers: any[] = []): PiotroskiResult {
  const roa = finite(fundamentals.returnOnAssets);
  const priorRoa = finite(fundamentals.priorReturnOnAssets);
  const ocf = finite(fundamentals.operatingCashflow);
  const netIncome = finite(fundamentals.netIncome);
  const leverage = finite(fundamentals.longTermDebtToAssets);
  const priorLeverage = finite(fundamentals.priorLongTermDebtToAssets);
  const currentRatio = finite(fundamentals.currentRatio);
  const priorCurrentRatio = finite(fundamentals.priorCurrentRatio);
  const shares = finite(fundamentals.sharesOutstanding);
  const priorShares = finite(fundamentals.priorSharesOutstanding);
  const grossMargin = finite(fundamentals.grossMargins);
  const priorGrossMargin = finite(fundamentals.priorGrossMargins);
  const assetTurnover = finite(fundamentals.assetTurnover);
  const priorAssetTurnover = finite(fundamentals.priorAssetTurnover);

  const checks: PiotroskiCheck[] = [
    check('POSITIVE_ROA', 'ROA Positif', 'PROFITABILITY', roa == null ? null : roa > 0, roa == null ? unavailableDetail() : `ROA ${(roa * 100).toFixed(1)}%`),
    check('POSITIVE_CFO', 'Arus Kas Operasi Positif', 'PROFITABILITY', ocf == null ? null : ocf > 0, ocf == null ? unavailableDetail() : `CFO ${ocf > 0 ? 'positif' : 'tidak positif'}`),
    check('DELTA_ROA', 'ROA Meningkat vs Periode Sebelumnya', 'PROFITABILITY', roa == null || priorRoa == null ? null : roa > priorRoa, roa == null || priorRoa == null ? unavailableDetail() : `ROA ${(priorRoa * 100).toFixed(1)}% → ${(roa * 100).toFixed(1)}%`),
    check('ACCRUAL_QUALITY', 'CFO > Laba Bersih', 'PROFITABILITY', ocf == null || netIncome == null ? null : ocf > netIncome, ocf == null || netIncome == null ? unavailableDetail() : 'Dibandingkan langsung dari CFO dan laba bersih periode yang sama.'),
    check('LOWER_LEVERAGE', 'Leverage Menurun', 'LEVERAGE', leverage == null || priorLeverage == null ? null : leverage < priorLeverage, leverage == null || priorLeverage == null ? unavailableDetail() : `Leverage ${priorLeverage.toFixed(3)} → ${leverage.toFixed(3)}`),
    check('HIGHER_LIQUIDITY', 'Current Ratio Meningkat', 'LEVERAGE', currentRatio == null || priorCurrentRatio == null ? null : currentRatio > priorCurrentRatio, currentRatio == null || priorCurrentRatio == null ? unavailableDetail() : `Current ratio ${priorCurrentRatio.toFixed(2)}x → ${currentRatio.toFixed(2)}x`),
    check('NO_DILUTION', 'Tidak Ada Dilusi Saham', 'LEVERAGE', shares == null || priorShares == null ? null : shares <= priorShares, shares == null || priorShares == null ? unavailableDetail() : `Saham beredar ${priorShares.toLocaleString('id-ID')} → ${shares.toLocaleString('id-ID')}`),
    check('HIGHER_GROSS_MARGIN', 'Gross Margin Meningkat', 'OPERATING_EFFICIENCY', grossMargin == null || priorGrossMargin == null ? null : grossMargin > priorGrossMargin, grossMargin == null || priorGrossMargin == null ? unavailableDetail() : `Gross margin ${(priorGrossMargin * 100).toFixed(1)}% → ${(grossMargin * 100).toFixed(1)}%`),
    check('HIGHER_ASSET_TURNOVER', 'Asset Turnover Meningkat', 'OPERATING_EFFICIENCY', assetTurnover == null || priorAssetTurnover == null ? null : assetTurnover > priorAssetTurnover, assetTurnover == null || priorAssetTurnover == null ? unavailableDetail() : `Asset turnover ${priorAssetTurnover.toFixed(2)}x → ${assetTurnover.toFixed(2)}x`),
  ];

  const availableChecks = checks.filter((item) => item.passed != null).length;
  if (availableChecks < 9) {
    return {
      score: null,
      maxScore: 9,
      availableChecks,
      verdict: 'DATA_UNAVAILABLE',
      verdictLabelKey: 'fundamentalEnhance.dataUnavailable',
      checks,
    };
  }

  const score = checks.filter((item) => item.passed === true).length;
  const verdict = score >= 7 ? 'STRONG' : score <= 3 ? 'WEAK' : 'MODERATE';
  return {
    score,
    maxScore: 9,
    availableChecks,
    verdict,
    verdictLabelKey: verdict === 'STRONG'
      ? 'fundamentalEnhance.fScoreStrong'
      : verdict === 'WEAK'
      ? 'fundamentalEnhance.fScoreWeak'
      : 'fundamentalEnhance.fScoreModerate',
    checks,
  };
}

/**
 * Altman Z (public manufacturing form):
 * Z = 1.2(WC/TA) + 1.4(RE/TA) + 3.3(EBIT/TA) + 0.6(MVE/TL) + 1.0(Sales/TA).
 * Tidak ada proxy PBV/DER/ROA untuk mengganti komponen yang hilang.
 */
export function calculateAltmanZScore(fundamentals: any = {}, profile: any = {}): AltmanZResult {
  const isFinancialSector = Boolean(
    profile?.sector?.includes('Financial') ||
    profile?.industry?.includes('Bank') ||
    profile?.industry?.includes('Insurance'),
  );

  if (isFinancialSector) {
    return {
      score: null,
      zone: 'NOT_APPLICABLE',
      zoneLabelKey: 'fundamentalEnhance.zScoreBankNA',
      isFinancialSector: true,
      explanation: 'Altman Z-Score tidak diterapkan pada bank/financial karena struktur neracanya berbeda.',
    };
  }

  const workingCapital = finite(fundamentals.workingCapital);
  const totalAssets = finite(fundamentals.totalAssets);
  const retainedEarnings = finite(fundamentals.retainedEarnings);
  const ebit = finite(fundamentals.ebit);
  const marketCap = finite(fundamentals.marketCap);
  const totalLiabilities = finite(fundamentals.totalLiabilities);
  const sales = finite(fundamentals.totalRevenue);

  if (
    workingCapital == null || totalAssets == null || totalAssets <= 0 || retainedEarnings == null ||
    ebit == null || marketCap == null || totalLiabilities == null || totalLiabilities <= 0 || sales == null
  ) {
    return {
      score: null,
      zone: 'DATA_UNAVAILABLE',
      zoneLabelKey: 'fundamentalEnhance.dataUnavailable',
      isFinancialSector: false,
      explanation: 'Altman Z-Score tidak dihitung karena komponen neraca/laba yang diwajibkan formula belum tersedia. Tidak ada angka default yang digunakan.',
    };
  }

  const scoreRaw =
    1.2 * (workingCapital / totalAssets) +
    1.4 * (retainedEarnings / totalAssets) +
    3.3 * (ebit / totalAssets) +
    0.6 * (marketCap / totalLiabilities) +
    1.0 * (sales / totalAssets);
  const score = Math.round(scoreRaw * 100) / 100;
  const zone: AltmanZResult['zone'] = score < 1.8 ? 'DISTRESS' : score <= 2.99 ? 'GREY' : 'SAFE';
  return {
    score,
    zone,
    zoneLabelKey: zone === 'SAFE'
      ? 'fundamentalEnhance.zScoreSafe'
      : zone === 'GREY'
      ? 'fundamentalEnhance.zScoreGrey'
      : 'fundamentalEnhance.zScoreDistress',
    isFinancialSector: false,
    explanation: 'Skor dihitung langsung dari lima komponen Altman Z tanpa proxy atau nilai default.',
  };
}

export interface SectorMedianInput {
  pe: number | null;
  pbv: number | null;
  roePct: number | null;
  source: string;
}

/** Sector benchmark hanya diterbitkan jika median peer yang nyata diberikan caller. */
export function calculateSectorBenchmark(
  sector: string = '',
  fundamentals: any = {},
  median: SectorMedianInput | null = null,
): SectorBenchmarkResult {
  const emitenPE = finite(fundamentals.trailingPE);
  const emitenPBV = finite(fundamentals.priceToBook);
  const roe = finite(fundamentals.returnOnEquity);
  const emitenROE = roe == null ? null : roe * 100;
  const sectorMedianPE = median && finite(median.pe) != null && Number(median.pe) > 0 ? Number(median.pe) : null;
  const sectorMedianPBV = median && finite(median.pbv) != null && Number(median.pbv) > 0 ? Number(median.pbv) : null;
  const sectorMedianROE = median ? finite(median.roePct) : null;

  const peDiscountPct = emitenPE != null && emitenPE > 0 && sectorMedianPE != null
    ? Math.round(((emitenPE - sectorMedianPE) / sectorMedianPE) * 100)
    : null;
  const pbvDiscountPct = emitenPBV != null && emitenPBV > 0 && sectorMedianPBV != null
    ? Math.round(((emitenPBV - sectorMedianPBV) / sectorMedianPBV) * 100)
    : null;
  const roeSpreadPct = emitenROE != null && sectorMedianROE != null
    ? Math.round((emitenROE - sectorMedianROE) * 10) / 10
    : null;

  let verdict: SectorBenchmarkResult['verdict'] = 'DATA_UNAVAILABLE';
  const hasValuationComparison = peDiscountPct != null || pbvDiscountPct != null;
  if (hasValuationComparison) {
    const valuationAttractive = (peDiscountPct != null && peDiscountPct < -15) || (pbvDiscountPct != null && pbvDiscountPct < -20);
    const valuationExpensive = (peDiscountPct != null && peDiscountPct > 25) || (pbvDiscountPct != null && pbvDiscountPct > 35);
    verdict = 'FAIR';
    if (valuationAttractive && (roeSpreadPct == null || roeSpreadPct >= 0)) verdict = 'ATTRACTIVE';
    else if (valuationExpensive) verdict = 'EXPENSIVE';
  }

  return {
    sectorName: sector || 'Sektor N/A',
    emitenPE: emitenPE != null && emitenPE > 0 ? emitenPE : null,
    sectorMedianPE,
    peDiscountPct,
    emitenPBV: emitenPBV != null && emitenPBV > 0 ? emitenPBV : null,
    sectorMedianPBV,
    pbvDiscountPct,
    emitenROE,
    sectorMedianROE,
    roeSpreadPct,
    verdict,
    source: median?.source ?? null,
  };
}

/**
 * Dividend safety adalah screening DERIVED dari data yang tersedia, bukan fakta audit.
 * Missing dividendYield tidak boleh disamakan dengan "tidak membayar dividen".
 */
export function calculateDividendSafety(fundamentals: any = {}): DividendSafetyResult {
  const rawYield = finite(fundamentals.dividendYield);
  const rawPayout = finite(fundamentals.payoutRatio);
  const fcf = finite(fundamentals.freeCashflow);
  const dividendYieldPct = rawYield == null ? null : Math.round(rawYield * 10_000) / 100;
  const payoutRatioPct = rawPayout == null ? null : Math.round(rawPayout * 10_000) / 100;

  if (dividendYieldPct == null) {
    return {
      hasDividend: null,
      dividendYieldPct: null,
      payoutRatioPct,
      safetyRating: 'DATA_UNAVAILABLE',
      fcfPositive: fcf == null ? null : fcf > 0,
      methodology: 'UNAVAILABLE',
      narrative: 'Data dividend yield tidak tersedia; SahamLens tidak menyimpulkan ada/tidaknya dividen.',
    };
  }

  if (dividendYieldPct === 0) {
    return {
      hasDividend: false,
      dividendYieldPct: 0,
      payoutRatioPct,
      safetyRating: 'NO_DIVIDEND',
      fcfPositive: fcf == null ? null : fcf > 0,
      methodology: 'SCREENING_HEURISTIC',
      narrative: 'Provider melaporkan dividend yield 0%. Ini bukan jaminan bahwa emiten tidak akan membayar dividen di masa depan.',
    };
  }

  const fcfPositive = fcf == null ? null : fcf > 0;
  if (payoutRatioPct == null || fcfPositive == null) {
    return {
      hasDividend: true,
      dividendYieldPct,
      payoutRatioPct,
      safetyRating: 'DATA_PARTIAL',
      fcfPositive,
      methodology: 'SCREENING_HEURISTIC',
      narrative: 'Dividend yield tersedia, tetapi payout ratio atau free cash flow belum lengkap. Rating keamanan tidak dipaksakan.',
    };
  }

  const safetyRating: DividendSafetyResult['safetyRating'] = payoutRatioPct > 85
    ? 'CAUTION'
    : payoutRatioPct > 65 || !fcfPositive
    ? 'MODERATE'
    : 'SAFE';
  const narrative = safetyRating === 'SAFE'
    ? 'Screening menunjukkan payout ratio moderat dan free cash flow positif. Ini indikator model, bukan jaminan dividen.'
    : safetyRating === 'CAUTION'
    ? 'Payout ratio tinggi; ruang laba ditahan terbatas dan risiko pemangkasan perlu diperhatikan.'
    : 'Payout ratio/arus kas memerlukan perhatian. Ini screening berbasis data yang tersedia, bukan prediksi dividen.';

  return {
    hasDividend: true,
    dividendYieldPct,
    payoutRatioPct,
    safetyRating,
    fcfPositive,
    methodology: 'SCREENING_HEURISTIC',
    narrative,
  };
}

function empiricalPercentile(current: number | null, history: unknown): { percentile: number | null; sampleSize: number } {
  if (current == null || current <= 0 || !Array.isArray(history)) return { percentile: null, sampleSize: 0 };
  const values = history.map(finite).filter((value): value is number => value != null && value > 0);
  if (values.length < 8) return { percentile: null, sampleSize: values.length };
  const lessOrEqual = values.filter((value) => value <= current).length;
  return { percentile: Math.round((lessOrEqual / values.length) * 100), sampleSize: values.length };
}

function percentileZone(value: number | null): ValuationPercentileResult['peZone'] {
  if (value == null) return 'DATA_UNAVAILABLE';
  if (value <= 35) return 'HISTORICALLY_CHEAP';
  if (value >= 75) return 'HISTORICALLY_EXPENSIVE';
  return 'FAIR';
}

/** Historical percentile hanya dari historical series nyata yang diberikan caller. */
export function calculateValuationPercentile(fundamentals: any = {}): ValuationPercentileResult {
  const pe = finite(fundamentals.trailingPE);
  const pbv = finite(fundamentals.priceToBook);
  const peResult = empiricalPercentile(pe, fundamentals.historicalPE);
  const pbvResult = empiricalPercentile(pbv, fundamentals.historicalPBV);
  return {
    pePercentile: peResult.percentile,
    pbvPercentile: pbvResult.percentile,
    peSampleSize: peResult.sampleSize,
    pbvSampleSize: pbvResult.sampleSize,
    peZone: percentileZone(peResult.percentile),
    pbvZone: percentileZone(pbvResult.percentile),
  };
}

export function buildFundamentalHealthSuite(
  fundamentals: any = {},
  profile: any = {},
  analyzers: any[] = [],
): FundamentalHealthSuiteResult {
  const sectorMedian = profile?.sectorMedian && typeof profile.sectorMedian === 'object'
    ? profile.sectorMedian as SectorMedianInput
    : null;
  return {
    piotroski: calculatePiotroskiFScore(fundamentals, analyzers),
    altmanZ: calculateAltmanZScore(fundamentals, profile),
    sectorBenchmark: calculateSectorBenchmark(profile?.sector || profile?.industry || '', fundamentals, sectorMedian),
    dividendSafety: calculateDividendSafety(fundamentals),
    valuationPercentile: calculateValuationPercentile(fundamentals),
  };
}
