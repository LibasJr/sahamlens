export type ReconciliationStatus = 'MATCH' | 'MISMATCH' | 'PRIMARY_ONLY' | 'SECONDARY_ONLY' | 'NO_DATA';

export interface CloseObservation {
  ticker: string;
  tradeDate: string;
  close: number;
  observedAt: string | null;
  source: string;
}

export interface CloseReconciliationRow {
  ticker: string;
  tradeDate: string;
  primarySource: string;
  secondarySource: string;
  primaryClose: number | null;
  secondaryClose: number | null;
  diffAbs: number | null;
  diffPct: number | null;
  status: ReconciliationStatus;
  primaryObservedAt: string | null;
  secondaryObservedAt: string | null;
  runId: string;
  detail: Record<string, unknown>;
}

export interface MarketIntegrityView {
  ticker: string;
  tradeDate: string;
  status: ReconciliationStatus;
  primaryClose: number | null;
  secondaryClose: number | null;
  diffAbs: number | null;
  diffPct: number | null;
  primarySource: string;
  secondarySource: string;
  underReview: boolean;
}
