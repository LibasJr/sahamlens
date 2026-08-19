import {
  analyzeEma,
  analyzeMarketFlow,
  analyzeMacd,
  analyzeMomentum,
  analyzeRsi,
  analyzeSma,
  analyzeSupport,
  analyzeTrend,
  analyzeVolatility,
  analyzeVolume,
} from '@/modules/technical';
import { isIdxMarketHoursNow, todayDateKeyWIB } from '@/shared/market/trading-session';
import { applyIdxLq45EodPrimary } from '@/modules/technical/service/idx-lq45-history.service';
import {
  appendStockFlowAnalyzers,
  type StockAnalysisFlowMetrics,
} from '@/modules/technical/service/stock-analysis-flow.service';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export interface StockIndicatorContext {
  timestamps: any[];
  quote: any;
  history: any[];
  analyzerHistory: any[];
  lastBar: any;
  isLiveFormingBar: boolean;
  analyzersResult: any[];
  flowMetrics: StockAnalysisFlowMetrics;
  eodHistory: any;
}

/**
 * Converts provider candles into validated history, applies the optional IDX LQ45 EOD
 * primary source, then runs all technical and money-flow analyzers over a bounded window.
 */
export async function buildStockIndicatorContext(
  ticker: string,
  range: string,
  result: any,
  currentPrice: number,
): Promise<StockIndicatorContext> {
  const timestamps = result.timestamp || [];
  const quote = result.indicators.quote[0];
  const adjcloseArr: (number | null)[] | undefined = result.indicators.adjclose?.[0]?.adjclose;

  let history: any[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i];
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];

    if (
      isFiniteNumber(timestamp) &&
      isFiniteNumber(open) &&
      isFiniteNumber(high) &&
      isFiniteNumber(low) &&
      isFinitePositive(close) &&
      isFiniteNonNegative(volume) &&
      high >= low
    ) {
      const adj = adjcloseArr?.[i];
      history.push({
        Date: new Date(timestamp * 1000).toISOString(),
        Open: open,
        High: high,
        Low: low,
        Close: close,
        Volume: volume,
        ...(isFinitePositive(adj) ? { AdjClose: adj } : {}),
      });
    }
  }

  const eodHistory = await applyIdxLq45EodPrimary(ticker, range, history);
  history = eodHistory.history;

  const analyzerHistory = history.slice(-200);
  const lastBar = analyzerHistory[analyzerHistory.length - 1];
  const isLiveFormingBar = Boolean(
    lastBar &&
      lastBar.Date.split('T')[0] === todayDateKeyWIB() &&
      isIdxMarketHoursNow(),
  );

  const analyzersResult = await Promise.all([
    Promise.resolve(analyzeEma(analyzerHistory, currentPrice)),
    Promise.resolve(analyzeRsi(analyzerHistory, currentPrice)),
    Promise.resolve(analyzeMacd(analyzerHistory, currentPrice)),
    Promise.resolve(analyzeVolume(analyzerHistory, currentPrice)),
    Promise.resolve(analyzeTrend(analyzerHistory, currentPrice)),
    Promise.resolve(analyzeVolatility(analyzerHistory, currentPrice)),
    Promise.resolve(analyzeMomentum(analyzerHistory, currentPrice)),
    Promise.resolve(analyzeSupport(analyzerHistory, currentPrice)),
    Promise.resolve(analyzeSma(analyzerHistory, currentPrice)),
    Promise.resolve(analyzeMarketFlow(analyzerHistory, currentPrice)),
  ]);

  const flowMetrics = appendStockFlowAnalyzers(ticker, analyzerHistory, analyzersResult);

  return {
    timestamps,
    quote,
    history,
    analyzerHistory,
    lastBar,
    isLiveFormingBar,
    analyzersResult,
    flowMetrics,
    eodHistory,
  };
}
