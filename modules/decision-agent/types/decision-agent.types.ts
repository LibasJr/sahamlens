export const DECISION_AGENT_VERSION = 'decision-agent-v2-hybrid' as const;

export type DecisionAction = 'BUY_CANDIDATE' | 'WATCH' | 'HOLD' | 'EXIT_REVIEW' | 'NO_SIGNAL';
export type PaperReadiness = 'PAPER_READY' | 'RESEARCH_ONLY';
export type HybridVerdict = 'CONFIRM' | 'CHALLENGE' | 'INSUFFICIENT_EVIDENCE';
export type HybridConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type HybridSignalStatus = 'NOT_REVIEWED' | 'CONFIRMED' | 'CHALLENGED' | 'INSUFFICIENT' | 'PROVIDER_FAILED';
export type HybridConcern =
  | 'NEGATIVE_NEWS_DOMINANCE'
  | 'LOW_COVERAGE_MARGIN'
  | 'MODEL_UNVALIDATED'
  | 'STALE_DATA'
  | 'RISK_REWARD_THIN'
  | 'TECHNICAL_BEARISH'
  | 'FUNDAMENTAL_WEAK'
  | 'FLOW_WEAK'
  | 'CONFLICTING_SIGNALS'
  | 'NEWS_UNAVAILABLE';
export type HybridNextEvidence =
  | 'NEED_FRESH_SNAPSHOT'
  | 'NEED_FULL_ARTICLE_SENTIMENT'
  | 'NEED_POINT_IN_TIME_VALIDATION'
  | 'NEED_FUNDAMENTAL_DETAIL'
  | 'NEED_FLOW_DETAIL';

export interface HybridSignalReview {
  verdict: HybridVerdict;
  confidence: HybridConfidence;
  evidenceRefs: string[];
  concerns: HybridConcern[];
  nextEvidence: HybridNextEvidence[];
  model: string;
  reviewedAt: string;
}

export type HybridRunStatus =
  | 'COMPLETED'
  | 'SKIPPED_NO_ELIGIBLE_SIGNALS'
  | 'SKIPPED_NOT_CONFIGURED'
  | 'PROVIDER_FAILED'
  | 'INVALID_OUTPUT';

export interface HybridRunMeta {
  status: HybridRunStatus;
  model: string | null;
  reviewedCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: string | null;
}
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
  hybridStatus: HybridSignalStatus;
  hybridReview: HybridSignalReview | null;
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
  rulePaperReady: number;
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
  hybrid: HybridRunMeta;
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
