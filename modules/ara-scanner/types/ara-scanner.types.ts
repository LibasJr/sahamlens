export const ARA_SCANNER_GATE_VERSION = 'ara-scanner-input-gate-v1' as const;

export type AraScannerRunStatus = 'NOT_RUN' | 'READY';
export type AraScannerInputStatus = 'MISSING' | 'PARTIAL' | 'STALE' | 'READY' | 'ERROR';
export type AraScannerEngineParityStatus = 'UNVERIFIED' | 'POLICY_CAPTURED' | 'MATCHED' | 'MISMATCHED';

export const ARA_SCANNER_INPUT_KEYS = [
  'ARA_CANDIDATES',
  'ARA_LIMIT',
  'ORDER_BOOK',
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
  required: true;
  source: string | null;
  observedAt: string | null;
  detail: string;
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
