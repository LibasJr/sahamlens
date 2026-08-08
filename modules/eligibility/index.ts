export { evaluateMinimalEligibility } from './service/eligibility.service';
export { toAdvisoryDecision, type AdvisoryAction, type AdvisoryDecision } from './service/advisory.service';
export {
  getDecisionPresentation,
  type DecisionPresentation,
  type DecisionPresentationKind,
} from './service/decision-presentation.service';
export type {
  EligibilityBar,
  EligibilityInput,
  EligibilityResult,
  EligibilityStatus,
} from './types/eligibility.types';
export {
  ADV_HARD_FLOOR_IDR,
  MAX_STALE_CALENDAR_DAYS,
  MAX_ZERO_VOL_DAYS,
  MAX_ZERO_VOL_IN_20,
  MIN_BARS,
  MIN_COVERAGE_FOR_RECOMMENDATION,
} from './constants/eligibility.constants';
