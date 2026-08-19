import {
  analyzePe,
  analyzePbv,
  analyzeRoe,
  analyzeRoa,
  analyzeDer,
  analyzeCurrentRatio,
  analyzeQuickRatio,
  analyzeDividend,
  analyzeEpsGrowth,
  analyzeRevenueGrowth,
  analyzeGrossMargin,
  analyzeOperatingMargin,
  analyzeNetMargin,
  computeFundamentalQuality,
} from '@/modules/fundamental';

export async function runFundamentalAnalyzerSuite(payload: any) {
  const analyzers = await Promise.all([
    Promise.resolve(analyzePe(payload)),
    Promise.resolve(analyzePbv(payload)),
    Promise.resolve(analyzeRoe(payload)),
    Promise.resolve(analyzeRoa(payload)),
    Promise.resolve(analyzeDer(payload)),
    Promise.resolve(analyzeCurrentRatio(payload)),
    Promise.resolve(analyzeQuickRatio(payload)),
    Promise.resolve(analyzeDividend(payload)),
    Promise.resolve(analyzeEpsGrowth(payload)),
    Promise.resolve(analyzeRevenueGrowth(payload)),
    Promise.resolve(analyzeGrossMargin(payload)),
    Promise.resolve(analyzeOperatingMargin(payload)),
    Promise.resolve(analyzeNetMargin(payload)),
  ]);

  let bullish = 0;
  let bearish = 0;
  let bestPerformer = analyzers[0];

  for (const result of analyzers) {
    if (result.decision === 'BULLISH') bullish++;
    else if (result.decision === 'BEARISH') bearish++;
    if (result.confidence > bestPerformer.confidence) bestPerformer = result;
  }

  return {
    analyzers,
    bullish,
    bearish,
    bestPerformer,
    fundamentalQuality: computeFundamentalQuality(bullish, bearish),
  };
}
