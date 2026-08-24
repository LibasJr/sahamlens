import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoredStock } from '@/modules/recommendation/service/ai-pick.service';
import { buildDecisionSignal } from '../decision-engine';
import { applyHybridAnalysis, buildSignalEvidence } from '../hybrid-analyst.service';

function candidate() {
  const stock: ScoredStock = {
    symbol: 'BBCA.JK', price: 10_000, changePct: 1, totalScore: 78, rsi: 55,
    accumulationConfirmed: true, breakdown: { technical: 30, fundamental: 25, flow: 23 },
    topReasons: ['Trend naik'], coverage: 90, kategori: 'BUY', eligibilityStatus: 'ELIGIBLE',
    eligibilityReasons: [], tradeSetup: { tp1: 11_000, tp2: 11_500, cl1: 9_500, cl2: 9_000, rr: 2 },
  };
  return buildDecisionSignal({
    stock, bearish: false, newsItems: [], dataAsOf: '2026-08-24T03:00:00.000Z',
    now: new Date('2026-08-24T03:10:00.000Z'), modelValidated: false,
  });
}

describe('hybrid analyst evidence gate', () => {
  const originalModels = process.env.NINEROUTER_MODELS;
  beforeEach(() => { process.env.NINEROUTER_MODELS = 'cc/claude-sonnet-5'; });
  afterEach(() => {
    if (originalModels === undefined) delete process.env.NINEROUTER_MODELS;
    else process.env.NINEROUTER_MODELS = originalModels;
  });

  it('menyimpan verdict hanya bila seluruh evidence ref berasal dari input aktual', async () => {
    const signal = candidate();
    const available = new Set(buildSignalEvidence(signal).map((item) => item.id));
    const refs = ['ruleAction', 'lensScore', 'coveragePct', 'riskReward', 'modelValidated']
      .map((field) => `E:BBCA:${field}`)
      .filter((ref) => available.has(ref));
    const runner = vi.fn(async () => ({
      output: { reviews: [{ ticker: 'BBCA', verdict: 'CONFIRM' as const, confidence: 'MEDIUM' as const, evidenceRefs: refs, concerns: ['MODEL_UNVALIDATED' as const], nextEvidence: ['NEED_POINT_IN_TIME_VALIDATION' as const] }] },
      inputTokens: 120, outputTokens: 30,
    }));
    const result = await applyHybridAnalysis({ signals: [signal], runner, now: new Date('2026-08-24T03:11:00.000Z') });
    expect(result.meta.status).toBe('COMPLETED');
    expect(result.signals[0].hybridStatus).toBe('CONFIRMED');
    expect(result.signals[0].hybridReview?.evidenceRefs).toEqual(refs);
  });

  it('menolak seluruh output bila model mengutip evidence id yang tidak pernah diberikan', async () => {
    const signal = candidate();
    const runner = vi.fn(async () => ({
      output: { reviews: [{ ticker: 'BBCA', verdict: 'CONFIRM' as const, confidence: 'HIGH' as const, evidenceRefs: ['E:BBCA:unknownEvidence'], concerns: [], nextEvidence: [] }] },
      inputTokens: null, outputTokens: null,
    }));
    const result = await applyHybridAnalysis({ signals: [signal], runner });
    expect(result.meta).toMatchObject({ status: 'INVALID_OUTPUT', errorCode: 'UNKNOWN_EVIDENCE_REF' });
    expect(result.signals[0].hybridReview).toBeNull();
  });

  it('menolak CONFIRM yang tidak mengutip score, coverage, dan risk/reward aktual', async () => {
    const signal = candidate();
    const runner = vi.fn(async () => ({
      output: { reviews: [{ ticker: 'BBCA', verdict: 'CONFIRM' as const, confidence: 'HIGH' as const, evidenceRefs: ['E:BBCA:ruleAction'], concerns: [], nextEvidence: [] }] },
      inputTokens: null, outputTokens: null,
    }));
    const result = await applyHybridAnalysis({ signals: [signal], runner });
    expect(result.meta).toMatchObject({ status: 'INVALID_OUTPUT', errorCode: 'UNGROUNDED_VERDICT' });
    expect(result.signals[0].hybridStatus).toBe('NOT_REVIEWED');
  });

  it('fail-closed bila provider gagal', async () => {
    const result = await applyHybridAnalysis({ signals: [candidate()], runner: async () => { throw new Error('timeout'); } });
    expect(result.meta.status).toBe('PROVIDER_FAILED');
    expect(result.signals[0].hybridStatus).toBe('PROVIDER_FAILED');
  });

  it('tidak memanggil LLM untuk snapshot stale', async () => {
    const stale = { ...candidate(), stale: true, paperReadiness: 'RESEARCH_ONLY' as const };
    const runner = vi.fn();
    const result = await applyHybridAnalysis({ signals: [stale], runner });
    expect(runner).not.toHaveBeenCalled();
    expect(result.meta.status).toBe('SKIPPED_NO_ELIGIBLE_SIGNALS');
  });
});
