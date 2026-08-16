// Barrel modules/ownership-flow.
//
// OWNERSHIP FLOW adalah modul BARU dan INDEPENDEN - bukan penggantian nama
// Broker Summary. Keduanya mengukur besaran yang berbeda dan tidak boleh
// disimpulkan satu dari yang lain; lihat docs/ownership-flow/broker-vs-ownership.md.
//
// STATUS FASE INI: raw metrics only. Tidak ada skor 0-100, tidak ada BUY/SELL,
// dan TIDAK masuk LensScore final (experimental=true, inFinalScore=false).
// Integrasi ke skor baru dipertimbangkan setelah histori cukup dan lolos
// Backtest/Calibration/out-of-sample - lihat docs/ownership-flow/validation-plan.md.

export type {
  DataQualityFlag,
  FreshnessStatus,
  OwnershipDelta,
  OwnershipDeltaSet,
  OwnershipFlowView,
  OwnershipObservation,
  OwnershipTrend,
  RejectedRow,
  SourceAuditStatus,
  SourceCadence,
} from './types/ownership-flow.types';

export {
  parseNumericToken,
  parsePercentageToken,
  roundTo,
} from './parser/number-normalize';

export {
  normalizeObservedDate,
  normalizeOwnershipTicker,
  parseOwnershipRow,
  PERCENT_SUM_TOLERANCE_PP,
  type ParseContext,
  type ParseOutcome,
  type RawOwnershipRow,
} from './parser/ownership-row.parser';

export {
  parseKseiRegisteredSecurityHtml,
  type KseiExtractOutcome,
} from './parser/ksei-registered-security.parser';

export {
  computeDelta,
  computeDeltaSet,
  diffCalendarDays,
  shiftDays,
  DELTA_HORIZON_DAYS,
  type ObservationPoint,
} from './service/ownership-delta';

export {
  assessFreshness,
  classifyOwnershipTrend,
  formatPp,
  CANDIDATE_TREND_THRESHOLD_PP,
  OWNERSHIP_TREND_THRESHOLDS_VALIDATED,
  STALE_AFTER_DAYS,
} from './scoring/ownership-flow-classification';

export {
  canIngest,
  getPrimarySource,
  getSourceById,
  KSEI_HOLDING_COMPOSITION_ARCHIVE,
  KSEI_REGISTERED_SECURITY,
  OWNERSHIP_SOURCES,
  type IngestionGate,
  type OwnershipSourceDescriptor,
} from './source/source-registry';

export {
  getOwnershipFlowConfig,
  OWNERSHIP_FLOW_USER_AGENT,
  type OwnershipFlowConfig,
} from './config/ownership-flow.config';

export {
  fetchOwnershipPage,
  mapWithConcurrency,
  type FetchOutcome,
} from './service/ownership-fetcher.service';

export {
  buildSourceUrl,
  getOwnershipUniverse,
  runOwnershipFlowIngestion,
  toShortCode,
  type IngestResult,
  type IngestStatus,
} from './service/ownership-flow-ingest.service';

export {
  getOwnershipFlowList,
  getOwnershipFlowView,
  getOwnershipSeries,
  type OwnershipFlowListRow,
  type OwnershipSeriesPoint,
} from './service/ownership-flow-query.service';

export {
  getOwnershipFlowMonitor,
  OWNERSHIP_FLOW_JOB_NAME,
  type OwnershipFlowMonitor,
} from './service/ownership-flow-monitor.service';

export {
  listOwnershipHistory,
  asOfObservation,
  getLatestObservation,
  getOwnershipHistoryStats,
  recordOwnershipObservations,
  recordOwnershipObservationsSafe,
  type OwnershipHistoryRow,
  type OwnershipHistoryStats,
} from './repository/ownership-flow-history.repository';
