// Barrel modul LensIntraday. Modul ini BERDIRI SENDIRI: tidak ada file di
// modules/lens-radar, modules/recommendation, maupun scoring produksi yang
// mengimpor dari sini, dan tidak boleh.

export {
  LENS_INTRADAY_MODEL_NAME,
  LENS_INTRADAY_MODEL_KEY,
  LENS_INTRADAY_MODEL_VERSION,
  LENS_INTRADAY_INITIAL_STATUS,
  LENS_INTRADAY_WEIGHTS,
  INTRADAY_HORIZONS,
  INTRADAY_HORIZON_LABEL,
  INTRADAY_COST_SCENARIOS,
  INTRADAY_SCORE_BUCKETS,
  INTRADAY_MODEL_STATUSES,
  INTRADAY_DISCLAIMER,
  DEFAULT_INTRADAY_CALENDAR,
  DEFAULT_INTRADAY_COST,
  defaultIntradayRunConfig,
  intradayConfigHash,
  intradayScoreBucket,
} from './constants/intraday-model';
export type {
  IntradayHorizon,
  IntradayModelStatus,
  IntradayRunConfig,
  IntradayWeights,
  IntradayCostConfig,
  IntradayCalendarConfig,
} from './constants/intraday-model';

export { ensureIntradaySchema } from './service/intraday-schema.service';
export { fetchIntradayBars, assessIntradayBars } from './service/intraday-bars.service';
export { buildIntradaySignals, simulateIntradayOutcome, simulateAllHorizons } from './service/intraday-signal.service';
export { runIntradayCollection, DEFAULT_INTRADAY_RESEARCH_UNIVERSE } from './service/intraday-collector.service';
export {
  runIntradayValidation,
  getIntradayDashboard,
  DEFAULT_ACCEPTANCE_CRITERIA,
  PRIMARY_HORIZON,
} from './service/intraday-validation.service';
export type { IntradayValidationResult, IntradayDashboard } from './service/intraday-validation.service';
export {
  simulateIntradayThresholds,
  proposeIntradayThreshold,
  proposeIntradayWeights,
  freezeIntradayOosProtocol,
} from './service/intraday-research.service';
export { listValidationRuns } from './repository/intraday.repository';
export { resetIntradayResearchData } from './repository/intraday.repository';
