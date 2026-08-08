import YahooFinanceClass from 'yahoo-finance2';
import { getUsdIdrRate } from '@/shared/market/usd-idr-rate';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Satu sumber current fundamental untuk endpoint Fundamental dan LensAI.
 * Menjaga koreksi currency mismatch tetap identik: Yahoo sudah memberi EPS/PER dalam
 * basis harga IDR, sedangkan BVPS/cash-flow emiten pelapor USD dapat masih USD.
 */
export async function fetchCurrentFundamentalSource(
  rawTicker: string,
  options: { timeoutMs?: number } = {},
): Promise<any | null> {
  let ticker = rawTicker.trim().toUpperCase();
  if (!ticker.includes('.')) ticker = `${ticker}.JK`;

  const request = yahooFinance.quoteSummary(ticker, {
    modules: ['defaultKeyStatistics', 'financialData', 'summaryDetail', 'price', 'assetProfile'],
  });

  const quoteSummary = options.timeoutMs
    ? await Promise.race([
        request,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('fundamental timeout')), options.timeoutMs)),
      ])
    : await request;

  if (!quoteSummary) return null;

  const priceCurrency = quoteSummary.price?.currency ?? null;
  const finCurrency = quoteSummary.financialData?.financialCurrency ?? null;
  const currentPrice = isFinitePositive(quoteSummary.price?.regularMarketPrice)
    ? quoteSummary.price.regularMarketPrice
    : null;

  const exchangeRate = priceCurrency === 'IDR' && finCurrency === 'USD'
    ? await getUsdIdrRate()
    : null;

  if (priceCurrency === 'IDR' && finCurrency === 'USD' && exchangeRate != null) {
    if (quoteSummary.defaultKeyStatistics?.bookValue) {
      quoteSummary.defaultKeyStatistics.bookValue *= exchangeRate;
    }
    if (quoteSummary.financialData) {
      if (quoteSummary.financialData.freeCashflow) quoteSummary.financialData.freeCashflow *= exchangeRate;
      if (quoteSummary.financialData.operatingCashflow) quoteSummary.financialData.operatingCashflow *= exchangeRate;
      if (quoteSummary.financialData.totalRevenue) quoteSummary.financialData.totalRevenue *= exchangeRate;
      if (quoteSummary.financialData.grossProfits) quoteSummary.financialData.grossProfits *= exchangeRate;
      if (quoteSummary.financialData.totalCash) quoteSummary.financialData.totalCash *= exchangeRate;
      if (quoteSummary.financialData.totalDebt) quoteSummary.financialData.totalDebt *= exchangeRate;
    }

    if (currentPrice != null && quoteSummary.defaultKeyStatistics?.bookValue) {
      quoteSummary.defaultKeyStatistics.priceToBook = currentPrice / quoteSummary.defaultKeyStatistics.bookValue;
    }
  } else if (priceCurrency === 'IDR' && finCurrency === 'USD') {
    // Tanpa kurs terverifikasi, field berbeda satuan harus fail closed.
    if (quoteSummary.defaultKeyStatistics) {
      quoteSummary.defaultKeyStatistics.bookValue = null;
      quoteSummary.defaultKeyStatistics.priceToBook = null;
    }
    if (quoteSummary.financialData) {
      quoteSummary.financialData.freeCashflow = null;
      quoteSummary.financialData.operatingCashflow = null;
      quoteSummary.financialData.totalRevenue = null;
      quoteSummary.financialData.grossProfits = null;
      quoteSummary.financialData.totalCash = null;
      quoteSummary.financialData.totalDebt = null;
    }
  }

  return quoteSummary;
}
