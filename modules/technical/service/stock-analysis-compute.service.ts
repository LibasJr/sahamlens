import type { HttpResult } from '@/shared/types/http-result.types';
import { correctPbvForUsdReporter } from '@/shared/market/usd-idr-rate';
import { buildStockIndicatorContext } from '@/modules/technical/service/stock-analysis-indicators.service';
import {
  buildStockScoringContext,
  type StockFundamentalSnapshot,
} from '@/modules/technical/service/stock-analysis-scoring.service';
import { buildStockAnalysisResponse } from '@/modules/technical/service/stock-analysis-response.service';

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

async function normalizeStockFundamentals(
  quoteSummary: any,
  currentPrice: number,
): Promise<StockFundamentalSnapshot> {
  if (!quoteSummary) {
    return {
      per: null,
      pbv: null,
      roe: null,
      der: null,
      currentRatio: null,
      revenueGrowth: null,
      marketCap: null,
    };
  }

  const marketCap = isFinitePositive(quoteSummary.price?.marketCap)
    ? quoteSummary.price.marketCap
    : null;
  const per = quoteSummary.summaryDetail?.trailingPE
    ?? quoteSummary.summaryDetail?.forwardPE
    ?? null;
  const rawPbv = quoteSummary.defaultKeyStatistics?.priceToBook ?? null;
  const roe = quoteSummary.financialData?.returnOnEquity != null
    ? quoteSummary.financialData.returnOnEquity * 100
    : null;
  const der = quoteSummary.financialData?.debtToEquity != null
    ? quoteSummary.financialData.debtToEquity / 100
    : null;
  const currentRatio = quoteSummary.financialData?.currentRatio ?? null;
  const revenueGrowth = quoteSummary.financialData?.revenueGrowth != null
    ? quoteSummary.financialData.revenueGrowth * 100
    : null;

  const pbv = await correctPbvForUsdReporter({
    priceCurrency: quoteSummary.price?.currency,
    financialCurrency: quoteSummary.financialData?.financialCurrency,
    bookValue: quoteSummary.defaultKeyStatistics?.bookValue,
    price: currentPrice,
    rawPbv,
  });

  return {
    per,
    pbv,
    roe,
    der,
    currentRatio,
    revenueGrowth,
    marketCap,
  };
}

/**
 * Application-level stock analysis pipeline. HTTP/access/cache concerns are intentionally
 * outside this function; each computation stage is delegated to a focused service.
 */
export async function computeStockAnalysisPayload(
  ticker: string,
  range: string,
  data: any,
  quoteSummary: any,
): Promise<HttpResult> {
  const result = data?.chart?.result?.[0];
  if (!result) {
    return { status: 404, body: { error: 'No data found' } };
  }

  const currentPrice = isFinitePositive(result.meta?.regularMarketPrice)
    ? result.meta.regularMarketPrice
    : null;
  if (currentPrice == null) {
    return { status: 503, body: { error: 'Harga pasar tidak tersedia' } };
  }

  const fundamentals = await normalizeStockFundamentals(quoteSummary, currentPrice);
  const indicators = await buildStockIndicatorContext(ticker, range, result, currentPrice);
  const scoring = await buildStockScoringContext({
    ticker,
    currentPrice,
    result,
    quoteSummary,
    analyzerHistory: indicators.analyzerHistory,
    lastBar: indicators.lastBar,
    isLiveFormingBar: indicators.isLiveFormingBar,
    analyzersResult: indicators.analyzersResult,
    flowMetrics: indicators.flowMetrics,
    fundamentals,
  });
  const payload = await buildStockAnalysisResponse({
    ticker,
    currentPrice,
    result,
    indicators,
    scoring,
    fundamentals,
  });

  return { status: 200, body: payload };
}
