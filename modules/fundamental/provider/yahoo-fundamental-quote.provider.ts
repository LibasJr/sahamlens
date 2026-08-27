import YahooFinanceClass from 'yahoo-finance2';
import { z } from 'zod';

/**
 * The subset of Yahoo's quoteSummary response used by the fundamental valuation
 * services.  Yahoo is an external, untrusted provider: keep its flexible payload
 * at this adapter boundary and expose only validated values to domain services.
 */
const nullableFiniteNumber = z
  .number()
  .finite()
  .nullable()
  .optional()
  .catch(undefined)
  .transform((value) => value ?? null);

const nullableString = z
  .string()
  .nullable()
  .optional()
  .catch(undefined)
  .transform((value) => value ?? null);

const assetProfileSchema = z.object({
  sector: nullableString,
  industry: nullableString,
  longBusinessSummary: nullableString,
  website: nullableString,
}).passthrough().nullable().optional().catch(null);

const defaultKeyStatisticsSchema = z.object({
  trailingEps: nullableFiniteNumber,
  bookValue: nullableFiniteNumber,
  sharesOutstanding: nullableFiniteNumber,
  beta: nullableFiniteNumber,
  priceToBook: nullableFiniteNumber,
  earningsQuarterlyGrowth: nullableFiniteNumber,
}).passthrough().nullable().optional().catch(null);

const financialDataSchema = z.object({
  returnOnEquity: nullableFiniteNumber,
  freeCashflow: nullableFiniteNumber,
  totalDebt: nullableFiniteNumber,
  totalCash: nullableFiniteNumber,
  operatingCashflow: nullableFiniteNumber,
  totalRevenue: nullableFiniteNumber,
  grossProfits: nullableFiniteNumber,
  returnOnAssets: nullableFiniteNumber,
  debtToEquity: nullableFiniteNumber,
  currentRatio: nullableFiniteNumber,
  quickRatio: nullableFiniteNumber,
  revenueGrowth: nullableFiniteNumber,
  ebitda: nullableFiniteNumber,
  profitMargins: nullableFiniteNumber,
  grossMargins: nullableFiniteNumber,
  operatingMargins: nullableFiniteNumber,
  netInterestMargin: nullableFiniteNumber,
  financialCurrency: nullableString,
}).passthrough().nullable().optional().catch(null);

const summaryDetailSchema = z.object({
  dividendRate: nullableFiniteNumber,
  payoutRatio: nullableFiniteNumber,
  trailingPE: nullableFiniteNumber,
  forwardPE: nullableFiniteNumber,
  marketCap: nullableFiniteNumber,
  dividendYield: nullableFiniteNumber,
  trailingAnnualDividendRate: nullableFiniteNumber,
}).passthrough().nullable().optional().catch(null);

const priceSchema = z.object({
  regularMarketPrice: nullableFiniteNumber,
  regularMarketChangePercent: nullableFiniteNumber,
  regularMarketVolume: nullableFiniteNumber,
  marketCap: nullableFiniteNumber,
  currency: nullableString,
  longName: nullableString,
  shortName: nullableString,
}).passthrough().nullable().optional().catch(null);

const yahooFundamentalQuoteSchema = z.object({
  assetProfile: assetProfileSchema,
  defaultKeyStatistics: defaultKeyStatisticsSchema,
  financialData: financialDataSchema,
  summaryDetail: summaryDetailSchema,
  price: priceSchema,
}).passthrough();

export type YahooFundamentalQuote = z.infer<typeof yahooFundamentalQuoteSchema>;

/**
 * Returns null only when the provider response itself is not an object. Invalid
 * individual fields become null so one malformed value cannot discard otherwise
 * usable, independently validated financial data.
 */
export function parseYahooFundamentalQuote(payload: unknown): YahooFundamentalQuote | null {
  const parsed = yahooFundamentalQuoteSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

const FUNDAMENTAL_QUOTE_MODULES = [
  'assetProfile',
  'defaultKeyStatistics',
  'financialData',
  'summaryDetail',
  'price',
] as const;

interface YahooQuoteSummaryClient {
  quoteSummary(ticker: string, options: { modules: readonly string[] }): Promise<unknown>;
}

// yahoo-finance2's generic overload narrows this valid module combination to
// `never`. The cast is intentionally isolated at the provider adapter; callers
// receive the validated type above instead of an `any` provider payload.
const yahooFinance = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] }) as unknown as YahooQuoteSummaryClient;

export async function fetchYahooFundamentalQuote(
  ticker: string,
  options: { timeoutMs?: number } = {},
): Promise<YahooFundamentalQuote | null> {
  const request = yahooFinance.quoteSummary(ticker, { modules: FUNDAMENTAL_QUOTE_MODULES });
  const response = options.timeoutMs
    ? await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('fundamental timeout')), options.timeoutMs);
        }),
      ])
    : await request;
  return parseYahooFundamentalQuote(response);
}
