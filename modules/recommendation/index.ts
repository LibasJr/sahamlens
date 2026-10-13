export { analyzeStock } from './service/recommendation.service';
export { scanBreakouts, scanCrossSignals, type BreakoutEntry, type CrossEntry } from './service/breakout.service';
export {
  buildTradePlanV1,
  TRADE_PLAN_ENTRY_REFERENCE,
  TRADE_PLAN_VERSION,
  type TradePlanV1,
  type TradePlanInputs,
  type TradePlanTranche,
  type TradePlanPositionSizing,
  type TradePlanDataPoint,
} from './service/trade-plan';
