import { getBankFundamentalAsOf } from '@/modules/fundamental/repository/bank-fundamental.repository';
import { assessBankFundamentalQuality } from '@/modules/fundamental/service/bank-fundamental-quality.service';
import { fetchCurrentFundamentalSource } from '@/modules/fundamental/service/current-fundamental-source.service';
import { calculateIntrinsicValue, computeValuationLabel } from '@/modules/fundamental';
import { scoreFundamentalDataQuality } from '@/modules/validation';
import { fetchNormalizedEarnings } from '@/modules/fundamental/service/normalized-earnings.service';
import { buildMoatDurability } from '@/modules/fundamental/service/moat-durability.service';
import { runFundamentalAnalyzerSuite } from './fundamental-analyzer-suite.service';

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

async function translateCompanyDescription(text: string): Promise<string> {
  const fallback = text || 'Tidak ada deskripsi perusahaan.';
  if (!text) return fallback;
  try {
    const sliced = text.length > 2000 ? `${text.slice(0, 2000)}...` : text;
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=id&dt=t&q=${encodeURIComponent(sliced)}`;
    const response = await fetch(url);
    const json = await response.json();
    if (json?.[0]) return json[0].map((entry: any) => entry[0]).join('');
  } catch {
    // English source remains the fallback when translation is unavailable.
  }
  return fallback;
}

export async function computeCurrentFundamentalAnalysis(
  ticker: string,
): Promise<Record<string, unknown> | { notFound: true }> {
  const quoteSummary = await fetchCurrentFundamentalSource(ticker);
  if (!quoteSummary) return { notFound: true };

  const currentPrice = isFinitePositive(quoteSummary.price?.regularMarketPrice)
    ? quoteSummary.price.regularMarketPrice
    : null;

  const dataQuality = scoreFundamentalDataQuality({
    price: currentPrice,
    eps: isFiniteNumber(quoteSummary.defaultKeyStatistics?.trailingEps)
      ? quoteSummary.defaultKeyStatistics.trailingEps
      : null,
    bvps: isFiniteNumber(quoteSummary.defaultKeyStatistics?.bookValue)
      ? quoteSummary.defaultKeyStatistics.bookValue
      : null,
    per: isFiniteNumber(quoteSummary.summaryDetail?.trailingPE)
      ? quoteSummary.summaryDetail.trailingPE
      : null,
    pbv: isFiniteNumber(quoteSummary.defaultKeyStatistics?.priceToBook)
      ? quoteSummary.defaultKeyStatistics.priceToBook
      : null,
    roePct: isFiniteNumber(quoteSummary.financialData?.returnOnEquity)
      ? quoteSummary.financialData.returnOnEquity * 100
      : null,
  });

  const suite = await runFundamentalAnalyzerSuite(quoteSummary);

  let consensus = 'DATA TIDAK CUKUP';
  let costOfEquityPct: number | null = null;
  try {
    const intrinsic = await calculateIntrinsicValue(ticker);
    if (intrinsic) {
      consensus = computeValuationLabel(intrinsic.mos, intrinsic.fair_value);
      costOfEquityPct = typeof intrinsic.assumptions?.cost_of_equity_pct === 'number'
        ? intrinsic.assumptions.cost_of_equity_pct
        : null;
    }
  } catch (error) {
    console.warn(`[Fundamental] calculateIntrinsicValue gagal untuk ${ticker} - valuasi dilaporkan sebagai data tidak cukup`, error);
  }

  const [annualEarnings, bankFundamentals, description] = await Promise.all([
    fetchNormalizedEarnings(ticker).catch(() => null),
    getBankFundamentalAsOf(ticker).catch(() => null),
    translateCompanyDescription(quoteSummary.assetProfile?.longBusinessSummary || ''),
  ]);
  const moatDurability = buildMoatDurability(annualEarnings, costOfEquityPct);

  return {
    ticker,
    moatDurability,
    annualEarnings,
    price: currentPrice,
    source: {
      provider: 'Yahoo Finance',
      sourceType: 'PUBLIC_THIRD_PARTY',
      retrievedAt: new Date().toISOString(),
      period: 'Snapshot terbaru yang tersedia',
    },
    dataQuality,
    analyzers: suite.analyzers,
    consensus,
    fundamentalQuality: suite.fundamentalQuality,
    bestPerformer: suite.bestPerformer,
    stock: {
      symbol: ticker,
      current_price: currentPrice,
      name: quoteSummary.price?.longName || quoteSummary.price?.shortName || ticker,
      change_pct: isFiniteNumber(quoteSummary.price?.regularMarketChangePercent)
        ? parseFloat((quoteSummary.price.regularMarketChangePercent * 100).toFixed(2))
        : null,
      volume: isFiniteNonNegative(quoteSummary.price?.regularMarketVolume)
        ? quoteSummary.price.regularMarketVolume
        : null,
    },
    profile: {
      sector: quoteSummary.assetProfile?.sector || 'N/A',
      industry: quoteSummary.assetProfile?.industry || 'N/A',
      description,
      website: quoteSummary.assetProfile?.website || '',
    },
    bankFundamentals: bankFundamentals
      ? { ...bankFundamentals, status: 'DATA_ONLY' as const, quality: assessBankFundamentalQuality(bankFundamentals) }
      : null,
    fundamentals: {
      marketCap: quoteSummary.summaryDetail?.marketCap ?? quoteSummary.price?.marketCap ?? null,
      trailingPE: quoteSummary.summaryDetail?.trailingPE ?? null,
      forwardPE: quoteSummary.summaryDetail?.forwardPE ?? null,
      priceToBook: quoteSummary.defaultKeyStatistics?.priceToBook ?? null,
      returnOnEquity: quoteSummary.financialData?.returnOnEquity ?? null,
      returnOnAssets: quoteSummary.financialData?.returnOnAssets ?? null,
      debtToEquity: quoteSummary.financialData?.debtToEquity ?? null,
      currentRatio: quoteSummary.financialData?.currentRatio ?? null,
      quickRatio: quoteSummary.financialData?.quickRatio ?? null,
      revenueGrowth: quoteSummary.financialData?.revenueGrowth ?? null,
      earningsGrowth: quoteSummary.defaultKeyStatistics?.earningsQuarterlyGrowth ?? null,
      totalRevenue: quoteSummary.financialData?.totalRevenue ?? null,
      ebitda: quoteSummary.financialData?.ebitda ?? null,
      profitMargins: quoteSummary.financialData?.profitMargins ?? null,
      dividendYield: quoteSummary.summaryDetail?.dividendYield ?? null,
      payoutRatio: quoteSummary.summaryDetail?.payoutRatio ?? null,
      grossMargins: quoteSummary.financialData?.grossMargins ?? null,
      operatingMargins: quoteSummary.financialData?.operatingMargins ?? null,
      freeCashflow: quoteSummary.financialData?.freeCashflow ?? null,
      operatingCashflow: quoteSummary.financialData?.operatingCashflow ?? null,
      totalDebt: quoteSummary.financialData?.totalDebt ?? null,
      totalCash: quoteSummary.financialData?.totalCash ?? null,
      financialCurrency: quoteSummary.financialData?.financialCurrency ?? null,
      nim: quoteSummary.financialData?.netInterestMargin ?? null,
    },
  };
}
