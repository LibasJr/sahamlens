export const ARA_SCANNER_GATE_VERSION = 'ara-scanner-input-gate-v1' as const;

export type AraScannerRunStatus = 'NOT_RUN' | 'READY';
/**
 * OUT_OF_SCOPE is not a degraded state and never becomes READY. It marks an
 * input that SahamLens deliberately does not own, because SahamLens is an
 * analysis layer and not an order-execution venue. Such inputs must be excluded
 * from readiness blockers, otherwise the scanner stays NOT_RUN forever for a
 * reason that no future integration inside SahamLens can ever resolve.
 */
export type AraScannerInputStatus =
  | 'MISSING'
  | 'PARTIAL'
  | 'STALE'
  | 'READY'
  | 'ERROR'
  | 'OUT_OF_SCOPE';
export type AraScannerEngineParityStatus = 'UNVERIFIED' | 'POLICY_CAPTURED' | 'MATCHED' | 'MISMATCHED';

export const ARA_SCANNER_INPUT_KEYS = [
  'ARA_CANDIDATES',
  'ARA_LIMIT',
  'ORDER_BOOK',
  'LIQUIDITY_PROXY',
  'BREAKOUT_PERSISTENCE',
  'RELATIVE_TRADING_ACTIVITY',
  'MOMENTUM_EXHAUSTION',
  'TRADING_RESTRICTIONS',
  'PRICE_CROSS_CHECK',
] as const;

export type AraScannerInputKey = (typeof ARA_SCANNER_INPUT_KEYS)[number];

export interface AraScannerInputReadiness {
  key: AraScannerInputKey;
  label: string;
  status: AraScannerInputStatus;
  /**
   * False only for inputs SahamLens does not own by design (OUT_OF_SCOPE).
   * Never set to false merely because an integration is hard or unfinished.
   */
  required: boolean;
  source: string | null;
  observedAt: string | null;
  detail: string;
  /** Who is accountable for the input when SahamLens does not own it. */
  ownedBy?: 'SAHAMLENS' | 'EXECUTION_LAYER';
}

export interface AraScannerReadiness {
  status: AraScannerRunStatus;
  executionAllowed: boolean;
  dataInputsReady: boolean;
  algorithmReady: boolean;
  failClosed: true;
  signalCount: number;
  generatedAt: string;
  lastRunAt: string | null;
  blockerCount: number;
  blockers: AraScannerInputKey[];
  /** Inputs excluded from blockers because SahamLens does not own them. */
  outOfScopeInputs: AraScannerInputKey[];
  inputs: AraScannerInputReadiness[];
  engineParity: {
    target: 'HERMES';
    status: AraScannerEngineParityStatus;
    referenceVersion: string | null;
    checkedAt: string | null;
    detail: string;
  };
  gateVersion: typeof ARA_SCANNER_GATE_VERSION;
  reason: string;
}
