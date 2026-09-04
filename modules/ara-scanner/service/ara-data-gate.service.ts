import { ARA_SCANNER_POLICY } from '../config/ara-scanner-policy';

export type AraDataGateFailure =
  | 'INVALID_TIMESTAMP'
  | 'STALE_DATA'
  | 'TIMESTAMP_TOO_FAR_IN_FUTURE'
  | 'INSUFFICIENT_COMPONENT_WEIGHT'
  | 'CORPORATE_ACTION_UNADJUSTED'
  | 'SUSPENDED'
  | 'TRADING_RESTRICTED'
  | 'UNTRACEABLE_SOURCE_OR_TIME';

export interface AraCandidateDataGateInput {
  observedAt: string | null;
  evaluatedAt?: string;
  stale: boolean;
  availableComponentWeight: number;
  corporateActionAdjusted: boolean;
  suspended: boolean;
  tradingRestricted: boolean;
  sourceAndTimeTraceable: boolean;
}

export type AraCandidateDataGateResult =
  | { passed: true; failures: []; nextAction: 'PROCEED_TO_SCORE' }
  | { passed: false; failures: AraDataGateFailure[]; acs: null; nextAction: 'NO_ACTION' };

export function evaluateAraCandidateDataGate(input: AraCandidateDataGateInput): AraCandidateDataGateResult {
  const failures: AraDataGateFailure[] = [];
  const evaluatedAtMs = Date.parse(input.evaluatedAt ?? new Date().toISOString());
  const observedAtMs = input.observedAt == null ? Number.NaN : Date.parse(input.observedAt);

  if (!Number.isFinite(observedAtMs) || !Number.isFinite(evaluatedAtMs)) {
    failures.push('INVALID_TIMESTAMP');
  } else if (observedAtMs - evaluatedAtMs > ARA_SCANNER_POLICY.dataGate.maxFutureSkewMinutes * 60_000) {
    failures.push('TIMESTAMP_TOO_FAR_IN_FUTURE');
  }

  if (input.stale) failures.push('STALE_DATA');
  if (
    !Number.isFinite(input.availableComponentWeight) ||
    input.availableComponentWeight < ARA_SCANNER_POLICY.dataGate.minimumAvailableWeight ||
    input.availableComponentWeight > 1
  ) {
    failures.push('INSUFFICIENT_COMPONENT_WEIGHT');
  }
  if (!input.corporateActionAdjusted) failures.push('CORPORATE_ACTION_UNADJUSTED');
  if (input.suspended) failures.push('SUSPENDED');
  if (input.tradingRestricted) failures.push('TRADING_RESTRICTED');
  if (!input.sourceAndTimeTraceable) failures.push('UNTRACEABLE_SOURCE_OR_TIME');

  if (failures.length > 0) return { passed: false, failures, acs: null, nextAction: 'NO_ACTION' };
  return { passed: true, failures: [], nextAction: 'PROCEED_TO_SCORE' };
}
