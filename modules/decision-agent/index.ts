export { buildDecisionSignal } from './service/decision-engine';
export { runDecisionAgentScan } from './service/decision-scan.service';
export { getDecisionAgentDashboard } from './repository/decision-agent.repository';
export {
  configurePaperAccount,
  proposePaperOrder,
  executePaperOrder,
  rejectPaperOrder,
  executeLiveOrder,
  assertHybridConfirmed,
} from './service/paper-execution.service';
export { decisionAgentActionSchema } from './validator/decision-agent.validator';
export { applyHybridAnalysis, buildSignalEvidence, resolveHybridModel } from './service/hybrid-analyst.service';
export type {
  DecisionAgentDashboard,
  DecisionAction,
  DecisionAgentRun,
  DecisionAgentRunSummary,
  DecisionAgentSignal,
  PaperOrder,
  PaperOrderSide,
  PaperOrderStatus,
  PaperAccount,
  PaperPosition,
  PersistedDecisionSignal,
  HybridRunMeta,
  HybridSignalReview,
  HybridSignalStatus,
  HybridVerdict,
} from './types/decision-agent.types';
