// Barrel modules/technical - BUILD 002 (Refactor Domain). 10 analyzer teknikal murni
// (tanpa I/O, hanya fungsi dari OHLC history -> sinyal), plus consensus (voting bull/bear)
// dan scoring (skor komposit 0-100: Technical 40 + Fundamental 30 + Flow 30 - scoring.service
// SENGAJA tetap di sini meski menyentuh data fundamental, karena konsumennya selalu bersamaan
// dengan analyzer teknikal di app/api/stock/[ticker], bukan dipisah ke modules/fundamental).
export { calculateRsi } from './service/rsi';
export { analyze as analyzeEma } from './service/analyzers/ema-analyzer';
export { analyze as analyzeRsi } from './service/analyzers/rsi-analyzer';
export { analyze as analyzeMacd } from './service/analyzers/macd-analyzer';
export { analyze as analyzeVolume } from './service/analyzers/volume-analyzer';
export { analyze as analyzeTrend } from './service/analyzers/trend-analyzer';
export { analyze as analyzeVolatility } from './service/analyzers/volatility-analyzer';
export { analyze as analyzeMomentum } from './service/analyzers/momentum-analyzer';
export { analyze as analyzeSupport } from './service/analyzers/support-resistance';
export { analyze as analyzeSma } from './service/analyzers/moving-average';
export { analyze as analyzeMarketFlow } from './service/analyzers/market-flow';

export { calculateConsensus } from './service/consensus.service';
export {
  calculateScore,
  type TechnicalInput,
  type FundamentalInput,
  type FlowInput,
  type ScoringResult,
} from './service/scoring.service';

// BUILD 009 (Performance) - fetch+parse OHLC Yahoo yang sebelumnya diduplikasi di
// app/api/council/route.ts dan modules/ai/service/orchestrator.service.ts.
export { fetchYahooHistory, type OhlcRow, type YahooHistoryResult } from './service/yahoo-history.service';
