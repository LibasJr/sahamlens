import { mergeQuarterlyFinancials, type QuarterlyFinancialRow } from './earnings-period-merge';
import YahooFinanceClass from 'yahoo-finance2';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

export type EarningsResultStatus = 'BEAT' | 'MISS' | 'INLINE' | 'NO_DATA';

export interface EarningsQuarter {
  quarter: string;
  periodEnd: string | null;
  reportedDate: string | null;
  actualEps: number | null;
  estimatedEps: number | null;
  epsDifference: number | null;
  surprisePct: number | null;
  revenue: number | null;
  netIncome: number | null;
  profitMargin: number | null;
  status: EarningsResultStatus;
}

export interface EarningsAnnual {
  year: number;
  revenue: number | null;
  netIncome: number | null;
  profitMargin: number | null;
}

export interface PublicEarningsData {
  ticker: string;
  /** Kejujuran cakupan periode (2026-08-12). Deret Yahoo untuk emiten IDX berlubang;
   * lubang harus tampil SEBAGAI lubang, bukan disambung jadi garis mulus. */
  periodCoverage?: {
    missingQuarters: string[];
    addedFromTimeSeries: number;
    filledFromTimeSeries: number;
  };
  stock: {
    name: string;
    price: number | null;
    currency: string | null;
    sector: string | null;
    industry: string | null;
  };
  upcoming: {
    date: string | null;
    isEstimate: boolean;
    fiscalQuarter: string | null;
    methodology: string | null;
  };
  expectation: {
    periodEnd: string | null;
    eps: {
      average: number | null;
      low: number | null;
      high: number | null;
      yearAgo: number | null;
      growth: number | null;
      analystCount: number | null;
      currency: string | null;
    };
    revenue: {
      average: number | null;
      low: number | null;
      high: number | null;
      yearAgo: number | null;
      growth: number | null;
      analystCount: number | null;
      currency: string | null;
    };
    revisions: {
      up7d: number | null;
      down7d: number | null;
      up30d: number | null;
      down30d: number | null;
      currentEps: number | null;
      eps7dAgo: number | null;
      eps30dAgo: number | null;
      eps60dAgo: number | null;
      eps90dAgo: number | null;
    };
  };
  latestFundamentals: {
    revenueGrowth: number | null;
    earningsGrowth: number | null;
    profitMargin: number | null;
    operatingMargin: number | null;
    operatingCashflow: number | null;
    freeCashflow: number | null;
    financialCurrency: string | null;
  };
  quarters: EarningsQuarter[];
  annuals: EarningsAnnual[];
  warnings: Array<{
    code: string;
    title: string;
    detail: string;
    level: 'INFO' | 'CAUTION';
  }>;
  coverage: {
    available: number;
    expected: number;
    percent: number;
  };
  source: {
    provider: 'Yahoo Finance';
    sourceType: 'PUBLIC_THIRD_PARTY';
    retrievedAt: string;
    note: string;
  };
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isoDate(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function statusFromEps(actual: number | null, estimate: number | null): EarningsResultStatus {
  if (actual == null || estimate == null) return 'NO_DATA';
  if (actual > estimate) return 'BEAT';
  if (actual < estimate) return 'MISS';
  return 'INLINE';
}

function quarterLabelFromDate(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return String(Math.floor(date.getUTCMonth() / 3) + 1) + 'Q' + String(date.getUTCFullYear());
}

export function normalizePublicEarningsData(
  ticker: string,
  raw: any,
  retrievedAt: Date = new Date(),
): PublicEarningsData {
  const earnings = raw?.earnings;
  const earningsChart = earnings?.earningsChart;
  const financialsChart = earnings?.financialsChart;
  const trendList = Array.isArray(raw?.earningsTrend?.trend) ? raw.earningsTrend.trend : [];
  const currentTrend = trendList.find((item: any) => item?.period === '0q') ?? null;
  const calendarEarnings = raw?.calendarEvents?.earnings;
  const calendarDates = Array.isArray(calendarEarnings?.earningsDate) ? calendarEarnings.earningsDate : [];
  const chartDates = Array.isArray(earningsChart?.earningsDate) ? earningsChart.earningsDate : [];
  const upcomingDate = isoDate(calendarDates[0] ?? chartDates[0]);

  const financialQuarters = Array.isArray(financialsChart?.quarterly) ? financialsChart.quarterly : [];
  const financialByQuarter = new Map<string, any>();
  for (const item of financialQuarters) {
    const label = textValue(item?.fiscalQuarter) ?? textValue(item?.date);
    if (label) financialByQuarter.set(label, item);
  }

  const chartQuarters = Array.isArray(earningsChart?.quarterly) ? earningsChart.quarterly : [];
  const historyQuarters = Array.isArray(raw?.earningsHistory?.history) ? raw.earningsHistory.history : [];
  const quarterSource = chartQuarters.length > 0 ? chartQuarters : historyQuarters;

  const quarters = quarterSource.map((item: any, index: number): EarningsQuarter => {
    const periodEnd = isoDate(item?.periodEndDate ?? item?.quarter);
    const explicitLabel = textValue(item?.fiscalQuarter) ?? textValue(item?.date);
    const quarter = explicitLabel ?? quarterLabelFromDate(periodEnd, 'Kuartal ' + String(index + 1));
    const financial = financialByQuarter.get(quarter);
    const actualEps = finiteNumber(item?.actual ?? item?.epsActual);
    const estimatedEps = finiteNumber(item?.estimate ?? item?.epsEstimate);
    const rawSurprise = finiteNumber(item?.surprisePct);
    const historySurprise = finiteNumber(item?.surprisePercent);

    return {
      quarter,
      periodEnd,
      reportedDate: isoDate(item?.reportedDate),
      actualEps,
      estimatedEps,
      epsDifference: finiteNumber(item?.difference ?? item?.epsDifference),
      surprisePct: rawSurprise ?? (historySurprise == null ? null : historySurprise * 100),
      revenue: finiteNumber(financial?.revenue),
      netIncome: finiteNumber(financial?.earnings),
      profitMargin: finiteNumber(financial?.profitMargin),
      status: statusFromEps(actualEps, estimatedEps),
    };
  }).sort((left: EarningsQuarter, right: EarningsQuarter) => {
    if (!left.periodEnd || !right.periodEnd) return 0;
    return left.periodEnd.localeCompare(right.periodEnd);
  }).slice(-8);

  const annualSource = Array.isArray(financialsChart?.yearly) ? financialsChart.yearly : [];
  const annuals = annualSource.map((item: any): EarningsAnnual | null => {
    const year = finiteNumber(item?.date);
    if (year == null) return null;
    return {
      year,
      revenue: finiteNumber(item?.revenue),
      netIncome: finiteNumber(item?.earnings),
      profitMargin: finiteNumber(item?.profitMargin),
    };
  }).filter((item: EarningsAnnual | null): item is EarningsAnnual => item !== null).slice(-5);

  const epsEstimate = currentTrend?.earningsEstimate ?? {};
  const revenueEstimate = currentTrend?.revenueEstimate ?? {};
  const epsTrend = currentTrend?.epsTrend ?? {};
  const epsRevisions = currentTrend?.epsRevisions ?? {};
  const epsAverage = finiteNumber(epsEstimate?.avg ?? earningsChart?.currentQuarterEstimate);
  const epsAnalysts = finiteNumber(epsEstimate?.numberOfAnalysts);
  const revenueAverage = finiteNumber(revenueEstimate?.avg ?? calendarEarnings?.revenueAverage);
  const revenueAnalysts = finiteNumber(revenueEstimate?.numberOfAnalysts);
  const revenueGrowth = finiteNumber(raw?.financialData?.revenueGrowth);
  const earningsGrowth = finiteNumber(raw?.financialData?.earningsGrowth);
  const operatingCashflow = finiteNumber(raw?.financialData?.operatingCashflow);
  const freeCashflow = finiteNumber(raw?.financialData?.freeCashflow);
  const isDateEstimate = Boolean(calendarEarnings?.isEarningsDateEstimate ?? earningsChart?.isEarningsDateEstimate);

  const warnings: PublicEarningsData['warnings'] = [];
  if (upcomingDate && isDateEstimate) {
    warnings.push({
      code: 'ESTIMATED_DATE',
      title: 'Tanggal rilis masih estimasi',
      detail: 'Konfirmasi kembali melalui keterbukaan informasi atau situs investor relations emiten.',
      level: 'INFO',
    });
  }
  if (epsAnalysts != null && epsAnalysts > 0 && epsAnalysts < 3) {
    warnings.push({
      code: 'LOW_EPS_COVERAGE',
      title: 'Cakupan estimasi EPS tipis',
      detail: 'Konsensus hanya berasal dari ' + String(epsAnalysts) + ' analis sehingga rentan berubah.',
      level: 'CAUTION',
    });
  }
  if (revenueAnalysts != null && revenueAnalysts > 0 && revenueAnalysts < 3) {
    warnings.push({
      code: 'LOW_REVENUE_COVERAGE',
      title: 'Cakupan estimasi pendapatan tipis',
      detail: 'Konsensus pendapatan hanya berasal dari ' + String(revenueAnalysts) + ' analis.',
      level: 'CAUTION',
    });
  }
  if (revenueGrowth != null && revenueGrowth < 0) {
    warnings.push({
      code: 'NEGATIVE_REVENUE_GROWTH',
      title: 'Pendapatan sedang menyusut',
      detail: 'Pertumbuhan pendapatan terbaru tercatat negatif pada snapshot penyedia.',
      level: 'CAUTION',
    });
  }
  if (earningsGrowth != null && earningsGrowth < 0) {
    warnings.push({
      code: 'NEGATIVE_EARNINGS_GROWTH',
      title: 'Pertumbuhan laba sedang negatif',
      detail: 'Pertumbuhan laba terbaru tercatat negatif pada snapshot penyedia.',
      level: 'CAUTION',
    });
  }
  if (freeCashflow != null && freeCashflow < 0) {
    warnings.push({
      code: 'NEGATIVE_FREE_CASHFLOW',
      title: 'Free cash flow negatif',
      detail: 'Arus kas bebas terbaru berada di bawah nol; periksa penyebab dan periodenya di laporan emiten.',
      level: 'CAUTION',
    });
  }
  const latestQuarter = quarters.at(-1);
  if (latestQuarter?.status === 'MISS') {
    warnings.push({
      code: 'LATEST_EPS_MISS',
      title: 'EPS kuartal terakhir di bawah estimasi',
      detail: 'Hasil aktual terakhir berada di bawah estimasi konsensus penyedia data.',
      level: 'CAUTION',
    });
  }

  const coverageChecks = [
    upcomingDate != null,
    epsAverage != null,
    epsAnalysts != null,
    revenueAverage != null,
    revenueAnalysts != null,
    quarters.length > 0,
    annuals.length > 0,
    revenueGrowth != null,
    earningsGrowth != null,
  ];
  const available = coverageChecks.filter(Boolean).length;

  return {
    ticker,
    stock: {
      name: textValue(raw?.price?.longName) ?? textValue(raw?.price?.shortName) ?? ticker,
      price: finiteNumber(raw?.price?.regularMarketPrice),
      currency: textValue(raw?.price?.currency),
      sector: textValue(raw?.assetProfile?.sector),
      industry: textValue(raw?.assetProfile?.industry),
    },
    upcoming: {
      date: upcomingDate,
      isEstimate: isDateEstimate,
      fiscalQuarter: textValue(earningsChart?.currentFiscalQuarter ?? earningsChart?.currentCalendarQuarter),
      methodology: textValue(earnings?.defaultMethodology ?? raw?.earningsTrend?.defaultMethodology),
    },
    expectation: {
      periodEnd: isoDate(currentTrend?.endDate ?? earningsChart?.currentPeriodEndDate),
      eps: {
        average: epsAverage,
        low: finiteNumber(epsEstimate?.low ?? calendarEarnings?.earningsLow),
        high: finiteNumber(epsEstimate?.high ?? calendarEarnings?.earningsHigh),
        yearAgo: finiteNumber(epsEstimate?.yearAgoEps),
        growth: finiteNumber(epsEstimate?.growth ?? currentTrend?.growth),
        analystCount: epsAnalysts,
        currency: textValue(epsEstimate?.earningsCurrency ?? earnings?.financialCurrency),
      },
      revenue: {
        average: revenueAverage,
        low: finiteNumber(revenueEstimate?.low ?? calendarEarnings?.revenueLow),
        high: finiteNumber(revenueEstimate?.high ?? calendarEarnings?.revenueHigh),
        yearAgo: finiteNumber(revenueEstimate?.yearAgoRevenue),
        growth: finiteNumber(revenueEstimate?.growth),
        analystCount: revenueAnalysts,
        currency: textValue(revenueEstimate?.revenueCurrency ?? earnings?.financialCurrency),
      },
      revisions: {
        up7d: finiteNumber(epsRevisions?.upLast7days),
        down7d: finiteNumber(epsRevisions?.downLast7Days),
        up30d: finiteNumber(epsRevisions?.upLast30days),
        down30d: finiteNumber(epsRevisions?.downLast30days),
        currentEps: finiteNumber(epsTrend?.current),
        eps7dAgo: finiteNumber(epsTrend?.['7daysAgo']),
        eps30dAgo: finiteNumber(epsTrend?.['30daysAgo']),
        eps60dAgo: finiteNumber(epsTrend?.['60daysAgo']),
        eps90dAgo: finiteNumber(epsTrend?.['90daysAgo']),
      },
    },
    latestFundamentals: {
      revenueGrowth,
      earningsGrowth,
      profitMargin: finiteNumber(raw?.financialData?.profitMargins),
      operatingMargin: finiteNumber(raw?.financialData?.operatingMargins),
      operatingCashflow,
      freeCashflow,
      financialCurrency: textValue(raw?.financialData?.financialCurrency),
    },
    quarters,
    annuals,
    warnings,
    coverage: {
      available,
      expected: coverageChecks.length,
      percent: Math.round((available / coverageChecks.length) * 100),
    },
    source: {
      provider: 'Yahoo Finance',
      sourceType: 'PUBLIC_THIRD_PARTY',
      retrievedAt: retrievedAt.toISOString(),
      note: 'Data provider terstandardisasi; tanggal dan konsensus bukan panduan resmi emiten.',
    },
  };
}

/**
 * Deret keuangan kuartalan dari endpoint yang BERBEDA dengan quoteSummary.
 *
 * Diukur 2026-08-12: kedua sumber berlubang, dan lubangnya saling melengkapi.
 * `earningsChart` punya kuartal September yang tidak ada di deret waktu; deret waktu punya
 * Desember & Maret yang tidak ada di `earningsChart`. Digabung, PTBA naik dari 3 ke 6
 * kuartal dan BBCA dari 4 ke 6 - tanpa satu pun angka baru dikarang.
 *
 * Kegagalan menghasilkan array kosong, bukan lemparan: ini melengkapi halaman earnings,
 * dan tidak boleh menjatuhkan permintaan yang datanya sudah ada.
 */
async function fetchQuarterlyFinancials(ticker: string): Promise<QuarterlyFinancialRow[]> {
  try {
    const rows = await yahooFinance.fundamentalsTimeSeries(ticker, {
      period1: '2015-01-01',
      period2: new Date().toISOString().slice(0, 10),
      type: 'quarterly',
      module: 'financials',
    });
    return (rows ?? []).flatMap((row: any) => {
      const periodEnd = new Date(row?.date).toISOString?.().slice(0, 10);
      if (!periodEnd || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return [];
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      return [{
        periodEnd,
        revenue: num(row?.totalRevenue) ?? num(row?.operatingRevenue),
        netIncome: num(row?.netIncomeCommonStockholders) ?? num(row?.netIncome),
        operatingIncome: num(row?.operatingIncome),
      }];
    });
  } catch (error) {
    console.warn('[Earnings] deret kuartalan tidak terbaca untuk ' + ticker, error);
    return [];
  }
}

export async function fetchPublicEarningsData(ticker: string): Promise<PublicEarningsData> {
  const [raw, quarterlyFinancials] = await Promise.all([
    yahooFinance.quoteSummary(ticker, {
      modules: [
        'price',
        'assetProfile',
        'calendarEvents',
        'earnings',
        'earningsHistory',
        'earningsTrend',
        'financialData',
      ],
    }),
    fetchQuarterlyFinancials(ticker),
  ]);

  const data = normalizePublicEarningsData(ticker, raw);

  const merged = mergeQuarterlyFinancials<EarningsQuarter & Record<string, unknown>>(
    data.quarters as Array<EarningsQuarter & Record<string, unknown>>,
    quarterlyFinancials,
    (row) => ({
      quarter: quarterLabelFromPeriodEnd(row.periodEnd),
      periodEnd: row.periodEnd,
      reportedDate: null,
      // Deret waktu TIDAK punya EPS aktual/estimasi - null, bukan 0. Kuartal ini hadir
      // dengan angka keuangannya saja, dan itu dinyatakan apa adanya.
      actualEps: null,
      estimatedEps: null,
      epsDifference: null,
      surprisePct: null,
      revenue: row.revenue,
      netIncome: row.netIncome,
      profitMargin: row.revenue != null && row.revenue > 0 && row.netIncome != null
        ? row.netIncome / row.revenue
        : null,
      // Tidak ada EPS aktual/estimasi di deret waktu, jadi tidak ada yang bisa
      // dibandingkan - NO_DATA, bukan INLINE yang terbaca seperti 'sesuai perkiraan'.
      status: 'NO_DATA',
    }),
  );

  return {
    ...data,
    quarters: merged.periods.slice(-8) as EarningsQuarter[],
    periodCoverage: {
      missingQuarters: merged.missingQuarters,
      addedFromTimeSeries: merged.addedFromTimeSeries,
      filledFromTimeSeries: merged.filledFromTimeSeries,
    },
  };
}

/** 'Q1 2026' dari '2026-03-31'. */
function quarterLabelFromPeriodEnd(periodEnd: string): string {
  const month = Number(periodEnd.slice(5, 7));
  const quarter = Math.ceil(month / 3);
  return 'Q' + quarter + ' ' + periodEnd.slice(0, 4);
}
