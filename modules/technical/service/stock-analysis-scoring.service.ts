import { calculateConsensus, calculateScore } from '@/modules/technical';
import { resolveSectorProfile } from '@/modules/sector';
import { fetchNormalizedEarnings } from '@/modules/fundamental/service/normalized-earnings.service';
import { PRICE_ADJUSTMENT_VERSION, RETURN_PRICE_BASIS } from '@/shared/market/price-basis';
import type { StockAnalysisFlowMetrics } from '@/modules/technical/service/stock-analysis-flow.service';
import {
  buildLensScoreInputProvenance,
  type LensScoreInputProvenance,
} from '@/modules/technical/service/lens-score-input-provenance.service';

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export interface StockFundamentalSnapshot {
  per: number | null;
  pbv: number | null;
  roe: number | null;
  der: number | null;
  currentRatio: number | null;
  revenueGrowth: number | null;
  marketCap: number | null;
}

export interface StockScoringContext {
  bestPerformer: any;
  consensusData: any;
  consensus: any;
  adjustedCloses: number[] | null;
  currentAdjustedPrice: number | null;
  scoringResult: any;
  lensScoreInputProvenance: LensScoreInputProvenance;
}

/**
 * Produces consensus + LensScore from already validated analyzer/history inputs.
 * Missing adjusted prices, volume or indicator raws remain fail-closed rather than
 * receiving neutral numeric defaults.
 */
export async function buildStockScoringContext(args: {
  ticker: string;
  currentPrice: number;
  result: any;
  quoteSummary: any;
  analyzerHistory: any[];
  lastBar: any;
  isLiveFormingBar: boolean;
  analyzersResult: any[];
  flowMetrics: StockAnalysisFlowMetrics;
  fundamentals: StockFundamentalSnapshot;
}): Promise<StockScoringContext> {
  const {
    ticker,
    currentPrice,
    result,
    quoteSummary,
    analyzerHistory,
    lastBar,
    isLiveFormingBar,
    analyzersResult,
    flowMetrics,
    fundamentals,
  } = args;

  const bestPerformer = analyzersResult.reduce(
    (best: any, item: any) => (!best || item.confidence > best.confidence ? item : best),
    null,
  );
  const consensusData = calculateConsensus(analyzersResult);
  const consensus = consensusData.konsensus;

  const adjustedCloses = analyzerHistory.every((h: any) => isFinitePositive(h.AdjClose))
    ? analyzerHistory.map((h: any) => h.AdjClose as number)
    : null;
  const currentAdjustedPrice = adjustedCloses
    ? adjustedCloses[adjustedCloses.length - 1]
    : null;

  const maOf = (period: number): number | null =>
    adjustedCloses && adjustedCloses.length >= period
      ? adjustedCloses.slice(-period).reduce((sum, value) => sum + value, 0) / period
      : null;

  const rsiResult = analyzersResult.find((item: any) => item.label?.includes('RSI')) as any;
  const macdResult = analyzersResult.find((item: any) => item.label?.includes('MACD')) as any;
  const rsiVal = typeof rsiResult?.raw?.rsi === 'number' ? rsiResult.raw.rsi : null;
  const macdLineVal = typeof macdResult?.raw?.macdLine === 'number' ? macdResult.raw.macdLine : null;
  const macdSigVal = typeof macdResult?.raw?.macdSignal === 'number' ? macdResult.raw.macdSignal : null;
  const macdHistVal = typeof macdResult?.raw?.macdHist === 'number' ? macdResult.raw.macdHist : null;

  const rawVolToday = lastBar?.Volume;
  const volToday = !isLiveFormingBar && isFiniteNonNegative(rawVolToday) ? rawVolToday : null;
  const volWindow = analyzerHistory.slice(0, -1).slice(-20);
  const volAvg20v = volWindow.length === 20 && volWindow.every((h) => isFiniteNonNegative(h.Volume))
    ? volWindow.reduce((sum, h) => sum + h.Volume, 0) / 20
    : null;

  const cycleSectorProfile = resolveSectorProfile(
    quoteSummary?.assetProfile?.sector ?? null,
    quoteSummary?.assetProfile?.industry ?? null,
  );
  const normalizedEarnings = cycleSectorProfile.cyclical
    ? await fetchNormalizedEarnings(ticker).catch(() => null)
    : null;

  const technicalInput = {
    currentPrice,
    currentRawPrice: currentPrice,
    currentAdjustedPrice,
    currentPriceBasis: currentAdjustedPrice == null ? 'UNKNOWN' as const : RETURN_PRICE_BASIS,
    maPriceBasis: adjustedCloses == null ? 'UNKNOWN' as const : RETURN_PRICE_BASIS,
    adjustmentVersion: PRICE_ADJUSTMENT_VERSION,
    corporateActionStatus: 'NONE' as const,
    ma20: maOf(20),
    ma50: maOf(50),
    ma200: maOf(200),
    rsi: rsiVal,
    macdHist: macdHistVal,
    macdLine: macdLineVal,
    macdSignal: macdSigVal,
    volToday,
    volAvg20: volAvg20v,
    changePct: typeof result.meta?.regularMarketChangePercent === 'number'
      ? result.meta.regularMarketChangePercent * 100
      : null,
  };
  const fundamentalInput = {
    per: fundamentals.per,
    pbv: fundamentals.pbv,
    roe: fundamentals.roe,
    der: fundamentals.der,
    currentRatio: fundamentals.currentRatio,
    revenueGrowth: fundamentals.revenueGrowth,
    normalizedRoe: normalizedEarnings?.normalizedRoePct ?? null,
    sector: {
      yahooSector: quoteSummary?.assetProfile?.sector ?? null,
      yahooIndustry: quoteSummary?.assetProfile?.industry ?? null,
      payoutRatio: quoteSummary?.summaryDetail?.payoutRatio ?? null,
      beta: null,
    },
  };
  const flowInput = {
    cmf20: flowMetrics.flowPressure20,
    accumulationStatus: flowMetrics.accumulationStatus,
    consecutiveBuyDays: flowMetrics.consecutiveBuyDays,
    consecutiveSellDays: flowMetrics.consecutiveSellDays,
    volRatio: volToday != null && isFinitePositive(volAvg20v) ? volToday / volAvg20v : null,
    mfmPositiveRatio20: flowMetrics.mfmPositiveRatio20,
  };

  const scoringResult = calculateScore(ticker, technicalInput, fundamentalInput, flowInput);
  const lensScoreInputProvenance = buildLensScoreInputProvenance({
    technical: technicalInput,
    fundamental: fundamentalInput,
    flow: flowInput,
  });

  return {
    bestPerformer,
    consensusData,
    consensus,
    adjustedCloses,
    currentAdjustedPrice,
    scoringResult,
    lensScoreInputProvenance,
  };
}
