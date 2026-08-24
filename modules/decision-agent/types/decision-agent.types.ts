export const DECISION_AGENT_VERSION = 'decision-agent-v1-shadow' as const;

export type DecisionAction = 'BUY_CANDIDATE' | 'WATCH' | 'HOLD' | 'EXIT_REVIEW' | 'NO_SIGNAL';
export type PaperReadiness = 'PAPER_READY' | 'RESEARCH_ONLY';
export type LiveReadiness =
  | 'BLOCKED_MODEL_UNVALIDATED'
  | 'BLOCKED_STALE_DATA'
  | 'BLOCKED_DATA_QUALITY'
  | 'BLOCKED_BROKER_NOT_CONFIGURED';

export interface DecisionNewsEvidence {
  positive: number;
  neutral: number;
  negative: number;
  matchedHeadlines: string[];
  basis: 'HEADLINE_ONLY' | 'UNAVAILABLE';
}

export interface DecisionRiskSetup {
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  riskReward: number;
  riskPct: number;
}

export interface DecisionAgentSignal {
  ticker: string;
  action: DecisionAction;
  price: number;
  lensScore: number;
  coveragePct: number | null;
  paperReadiness: PaperReadiness;
  liveReadiness: LiveReadiness;
  dataAsOf: string;
  stale: boolean;
  modelValidated: boolean;
  scoreBreakdown: { technical: number; fundamental: number; flow: number } | null;
  riskSetup: DecisionRiskSetup | null;
  news: DecisionNewsEvidence;
  supportingReasons: string[];
  opposingReasons: string[];
  invalidationReasons: string[];
  eligibilityReasons: string[];
  version: typeof DECISION_AGENT_VERSION;
}

export interface DecisionAgentRunSummary {
  total: number;
  buyCandidates: number;
  watch: number;
  hold: number;
  exitReview: number;
  noSignal: number;
  paperReady: number;
  liveReady: 0;
}

export interface DecisionAgentRun {
  id: string;
  createdAt: string;
  dataAsOf: string;
  trigger: 'ADMIN' | 'SCHEDULED';
  modelValidated: boolean;
  version: typeof DECISION_AGENT_VERSION;
  summary: DecisionAgentRunSummary;
  signals: DecisionAgentSignal[];
}

export interface PersistedDecisionSignal extends DecisionAgentSignal {
  id: string;
  runId: string;
}

export type PaperOrderSide = 'BUY' | 'SELL';
export type PaperOrderStatus = 'PROPOSED' | 'EXECUTED' | 'REJECTED' | 'FAILED';

export interface PaperOrder {
  id: string;
  signalId: string;
  ticker: string;
  side: PaperOrderSide;
  lots: number;
  limitPrice: number;
  status: PaperOrderStatus;
  rationale: string;
  proposedAt: string;
  executedAt: string | null;
}

export interface PaperAccount {
  id: string;
  name: string;
  cash: number;
  initialCash: number;
  riskBudgetPct: number;
  maxPositionPct: number;
  maxOpenPositions: number;
  enabled: boolean;
}

export interface PaperPosition {
  ticker: string;
  lots: number;
  avgPrice: number;
  lastPrice: number;
}

export interface DecisionAgentDashboard {
  latestRun: Omit<DecisionAgentRun, 'signals'> | null;
  signals: PersistedDecisionSignal[];
  paperAccount: PaperAccount | null;
  positions: PaperPosition[];
  orders: PaperOrder[];
}
