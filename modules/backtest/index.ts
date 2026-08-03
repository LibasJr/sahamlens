// Public API module backtest/ - satu-satunya yang boleh diimpor route/module lain.
// Jangan pernah import langsung dari modules/backtest/service/*, .../constants/* dst
// dari luar module ini (pola sama seperti modules/user, modules/watchlist).
export { precomputeBacktestData, computeTickerSeries } from './service/precompute.service';
export { writeBacktestCache, readBacktestCache } from './service/cache.service';
export { simulateBacktest } from './service/simulate.service';
export { scanLiveFilterCheck, type LiveFilterMatch, type LiveFilterCheckResult } from './service/live-filter-check.service';
export type {
  IndicatorName,
  Decision,
  DailyBar,
  TickerIndicatorSeries,
  BacktestIndicatorCache,
  SimulateInput,
  TradeRecord,
  SimulateResult,
} from './types/backtest.types';
