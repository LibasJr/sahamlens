// Barrel modules/technical - BUILD 002 (Refactor Domain). 15 analyzer teknikal murni
// (tanpa I/O, hanya fungsi dari OHLC history -> sinyal), plus consensus (voting bull/bear)
// dan scoring (skor komposit 0-100: Technical 40 + Fundamental 30 + Flow 30 - scoring.service
// SENGAJA tetap di sini meski menyentuh data fundamental, karena konsumennya selalu bersamaan
// dengan analyzer teknikal di app/api/stock/[ticker], bukan dipisah ke modules/fundamental).
//
// 5 analyzer di bawah (Stochastic/Bollinger/ADX/OBV/Williams %R, 2026-08-22) BELUM diikutkan
// ke LensScore/consensus/backtest filter/recommendation dimensions - itu keputusan
// metodologi terpisah (menaikkan SCORE_VERSION, mendefinisikan bobot baru) yang sengaja
// tidak dibuat sepihak di sini. Fungsinya sudah lengkap & teruji (golden test terhadap
// implementasi independen), tinggal dipakai kalau/ketika keputusan itu dibuat.
export { calculateRsi } from './service/rsi';
export { calculateWilderAtr, wilderAtrAt, ATR_PERIOD, type TrueRangeBar } from './service/atr';
export { calculateStochastic, STOCHASTIC_PERIOD, STOCHASTIC_SMOOTH_K, STOCHASTIC_PERIOD_D, type StochasticBar, type StochasticResult } from './service/stochastic';
export { calculateBollingerBands, BOLLINGER_PERIOD, BOLLINGER_K, type BollingerBandsResult } from './service/bollinger-bands';
export { calculateAdx, ADX_PERIOD, type AdxResult } from './service/adx';
export { calculateObvSeries, obvSlope, type ObvBar } from './service/obv';
export { calculateWilliamsR, WILLIAMS_R_PERIOD, type WilliamsRBar } from './service/williams-r';
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
export { analyze as analyzeStochastic } from './service/analyzers/stochastic-analyzer';
export { analyze as analyzeBollinger } from './service/analyzers/bollinger-analyzer';
export { analyze as analyzeAdx } from './service/analyzers/adx-analyzer';
export { analyze as analyzeObv } from './service/analyzers/obv-analyzer';
export { analyze as analyzeWilliamsR } from './service/analyzers/williams-r-analyzer';

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
export { fetchYahooHistory, fetchYahooHistoryDirect, type OhlcRow, type YahooHistoryResult } from './service/yahoo-history.service';
