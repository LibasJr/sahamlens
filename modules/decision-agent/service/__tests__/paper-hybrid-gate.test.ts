import { describe, expect, it } from 'vitest';
import { ConflictError } from '@/shared/errors/app-error';
import type { DecisionAgentSignal } from '../../types/decision-agent.types';
import { assertHybridConfirmed } from '../paper-execution.service';

function signal(): DecisionAgentSignal {
  return {
    ticker: 'BBCA', action: 'BUY_CANDIDATE', price: 10_000, lensScore: 78, coveragePct: 90,
    paperReadiness: 'PAPER_READY', liveReadiness: 'BLOCKED_MODEL_UNVALIDATED',
    dataAsOf: '2026-08-24T03:00:00.000Z', stale: false, modelValidated: false,
    scoreBreakdown: { technical: 30, fundamental: 25, flow: 23 },
    riskSetup: { entry: 10_000, stop: 9_500, target1: 11_000, target2: 11_500, riskReward: 2, riskPct: 5 },
    news: { positive: 0, neutral: 0, negative: 0, matchedHeadlines: [], matchedArticles: [], basis: 'UNAVAILABLE' },
    sector: 'Financial Services', avgValue20d: 500_000_000_000,
    supportingReasons: [], opposingReasons: [], invalidationReasons: [], eligibilityReasons: [],
    hybridStatus: 'NOT_REVIEWED', hybridReview: null, version: 'decision-agent-v2-hybrid',
  };
}

// Catatan (2026-08-27): assertHybridConfirmed tidak lagi dipanggil dari
// proposePaperOrder - lihat paper-execution.service.ts. Test ini menjaga
// perilaku fungsinya sendiri kalau nanti disambung ulang.
describe('paper hybrid gate', () => {
  it('menolak sinyal rule-only tanpa confirmation LLM', () => {
    expect(() => assertHybridConfirmed(signal())).toThrow(ConflictError);
  });

  it('menerima hanya review CONFIRM yang tervalidasi', () => {
    const reviewed: DecisionAgentSignal = {
      ...signal(), hybridStatus: 'CONFIRMED',
      hybridReview: {
        verdict: 'CONFIRM', confidence: 'MEDIUM', evidenceRefs: ['E:BBCA:lensScore'],
        concerns: ['MODEL_UNVALIDATED'], nextEvidence: ['NEED_POINT_IN_TIME_VALIDATION'],
        model: 'cc/claude-sonnet-5', reviewedAt: '2026-08-24T03:01:00.000Z',
      },
    };
    expect(() => assertHybridConfirmed(reviewed)).not.toThrow();
  });
});
