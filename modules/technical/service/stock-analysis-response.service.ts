import { calculateWilderAtr } from '@/modules/technical/service/atr';
import { buildLongTradingSetup } from '@/modules/recommendation/service/trading-setup';
import { evaluateMinimalEligibility, toAdvisoryDecision } from '@/modules/eligibility';
import { getLatestMarketIntegrity } from '@/modules/market-data-integrity/repository/market-data-reconciliation.repository';
import { resolvePreviousClose } from '@/shared/market/previous-close';
import { LENS_SCORE_MODEL_METADATA } from '@/modules/technical/config/lens-score-model';
import { getEmitenBoard } from '@/shared/market/emiten-list';
import { classifyFreshness } from '@/shared/http/freshness';
import { todayDateKeyWIB } from '@/shared/market/trading-session';
import { PRICE_ADJUSTMENT_VERSION, RETURN_PRICE_BASIS } from '@/shared/market/price-basis';
import type { StockFundamentalSnapshot, StockScoringContext } from '@/modules/technical/service/stock-analysis-scoring.service';
import type { StockIndicatorContext } from '@/modules/technical/service/stock-analysis-indicators.service';

/**
 * Final response assembly. This layer owns eligibility, TP/CL construction, freshness
 * and response metadata, but does not fetch provider data or calculate LensScore.
 */
export async function buildStockAnalysisResponse(args: {
  ticker: string;
  currentPrice: number;
  result: any;
  indicators: StockIndicatorContext;
  scoring: StockScoringContext;
  fundamentals: StockFundamentalSnapshot;
}) {
  const { ticker, currentPrice, result, indicators, scoring, fundamentals } = args;
  const {
    timestamps,
    quote,
    history,
    analyzerHistory,
    analyzersResult,
    eodHistory,
  } = indicators;
  const {
    bestPerformer,
    consensusData,
    consensus,
    adjustedCloses,
    currentAdjustedPrice,
    scoringResult,
    lensScoreInputProvenance,
  } = scoring;

  const eligibility = evaluateMinimalEligibility({
    ticker,
    asOf: todayDateKeyWIB(),
    bars: history.map((h: any) => ({
      date: h.Date.split('T')[0],
      close: typeof h.Close === 'number' ? h.Close : null,
      volume: typeof h.Volume === 'number' ? h.Volume : null,
    })),
    coveragePct: scoringResult.coverage_pct,
  });
  const decision = toAdvisoryDecision(scoringResult.kategori, eligibility);
  const freshness = classifyFreshness(result.meta?.regularMarketTime);
  const dataIntegrity = await getLatestMarketIntegrity(ticker);
  const trust = {
    data_status: freshness.freshness,
    data_timestamp: freshness.dataTimestamp,
    score_confidence: scoringResult.explainability.confidence_level,
    score_confidence_pct: scoringResult.explainability.confidence_score,
    research_label: scoringResult.explainability.research_label,
    model_actionability: scoringResult.explainability.actionability,
    advisory_enabled: decision.advisory === true,
    blocking_reasons: [
      ...scoringResult.explainability.risk_flags,
      ...eligibility.reasonCodes,
    ],
    data_gaps: scoringResult.explainability.data_gaps,
    source_quality: {
      eod_history: eodHistory.source,
      adjusted_close: eodHistory.adjustedCloseSource,
      reconciliation_status: eodHistory.latestCloseReconciliation,
      market_integrity: dataIntegrity?.status ?? null,
    },
  };

  // Zero Dummy Policy: incomplete candles are excluded from ATR/trading-level inputs.
  const setupHistory = analyzerHistory.flatMap((h: any) => {
    const high = typeof h.High === 'number' && Number.isFinite(h.High) && h.High > 0 ? h.High : null;
    const low = typeof h.Low === 'number' && Number.isFinite(h.Low) && h.Low > 0 ? h.Low : null;
    const close = typeof h.Close === 'number' && Number.isFinite(h.Close) && h.Close > 0 ? h.Close : null;
    if (high == null || low == null || close == null || high < low) return [];
    return [{
      High: high,
      Low: low,
      Close: close,
      AdjClose: typeof h.AdjClose === 'number' && Number.isFinite(h.AdjClose) && h.AdjClose > 0
        ? h.AdjClose
        : null,
    }];
  });
  const atrVal = calculateWilderAtr(setupHistory.map((h) => ({
    high: h.High,
    low: h.Low,
    close: h.Close,
  })));
  const tradeSetup = buildLongTradingSetup(setupHistory, currentPrice, atrVal);

  const { previousClose } = resolvePreviousClose({
    timestamps,
    closes: quote.close,
    metaPreviousClose: result.meta?.previousClose,
    metaChartPreviousClose: result.meta?.chartPreviousClose,
  });
  const changePct = typeof previousClose === 'number' && previousClose > 0
    ? parseFloat((((currentPrice - previousClose) / previousClose) * 100).toFixed(2))
    : null;

  return {
    ticker,
    price: currentPrice,
    tradeSetup,
    market_cap: fundamentals.marketCap,
    priceMeta: {
      raw: currentPrice,
      adjusted: currentAdjustedPrice,
      basis_used_for_score: adjustedCloses == null ? 'UNKNOWN' : RETURN_PRICE_BASIS,
      basis_used_for_trading_levels: 'RAW',
      adjustment_version: PRICE_ADJUSTMENT_VERSION,
      corporate_action_status: 'NONE',
    },
    analyzers: analyzersResult,
    consensus,
    consensusData,
    bestPerformer,
    scoring: scoringResult,
    trust,
    provenance: {
      lensScoreInputs: lensScoreInputProvenance,
    },
    eligibility: {
      status: eligibility.status,
      reasonCodes: eligibility.reasonCodes,
      blocking: eligibility.blocking,
      message: eligibility.message,
      details: eligibility.details,
    },
    decision,
    stock: {
      symbol: ticker,
      current_price: currentPrice,
      listing_board: getEmitenBoard(ticker),
      change_pct: changePct,
      volume: typeof history[history.length - 1]?.Volume === 'number'
        ? history[history.length - 1].Volume
        : null,
      history: history.map((h: any) => ({
        time: h.Date.split('T')[0],
        open: h.Open,
        high: h.High,
        low: h.Low,
        close: h.Close,
        adjClose: typeof h.AdjClose === 'number' ? h.AdjClose : null,
        volume: h.Volume,
      })),
    },
    technical: {},
    _meta: {
      lensScoreModel: LENS_SCORE_MODEL_METADATA,
      source: 'live',
      eodHistorySource: eodHistory.source,
      liveQuoteSource: 'YAHOO_CHART',
      adjustedCloseSource: eodHistory.adjustedCloseSource,
      lq45UniverseVersion: eodHistory.universeVersion,
      eodLatestTradeDate: eodHistory.latestTradeDate,
      eodReconciliationStatus: eodHistory.latestCloseReconciliation,
      computedAt: new Date().toISOString(),
      dataTimestamp: freshness.dataTimestamp,
      freshness: freshness.freshness,
      dataIntegrity,
      trust,
    },
  };
}