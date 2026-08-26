import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoredStock } from '@/modules/recommendation/service/ai-pick.service';
import { buildDecisionSignal } from '../decision-engine';
import { applyHybridAnalysis, buildSignalEvidence } from '../hybrid-analyst.service';

function candidate(overrides: Partial<ScoredStock> = {}) {
  const stock: ScoredStock = {
    symbol: 'BBCA.JK', price: 10_000, changePct: 1, totalScore: 78, rsi: 55,
    accumulationConfirmed: true, breakdown: { technical: 30, fundamental: 25, flow: 23 },
    ...overrides,
    topReasons: ['Trend naik'], coverage: 90, kategori: 'BUY', eligibilityStatus: 'ELIGIBLE',
    eligibilityReasons: [], tradeSetup: { tp1: 11_000, tp2: 11_500, cl1: 9_500, cl2: 9_000, rr: 2 },
  };
  return buildDecisionSignal({
    stock, bearish: false, newsItems: [], dataAsOf: '2026-08-24T03:00:00.000Z',
    now: new Date('2026-08-24T03:10:00.000Z'), modelValidated: false, sector: 'Financials',
  });
}

function exitReviewCandidate() {
  return {
    ...candidate(),
    ticker: 'BMRI',
    action: 'EXIT_REVIEW' as const,
    hybridStatus: 'NOT_REVIEWED' as const,
  };
}

describe('hybrid analyst evidence gate', () => {
  const originalModels = process.env.NINEROUTER_MODELS;
  const originalDecisionModel = process.env.DECISION_AGENT_LLM_MODEL;
  const originalReviewLimit = process.env.DECISION_AGENT_REVIEW_LIMIT;
  const originalMinLensScore = process.env.DECISION_AGENT_MIN_LENS_SCORE_FOR_REVIEW;
  beforeEach(() => {
    process.env.NINEROUTER_MODELS = 'cc/claude-sonnet-5';
    delete process.env.DECISION_AGENT_LLM_MODEL;
    delete process.env.DECISION_AGENT_REVIEW_LIMIT;
    delete process.env.DECISION_AGENT_MIN_LENS_SCORE_FOR_REVIEW;
  });
  afterEach(() => {
    if (originalModels === undefined) delete process.env.NINEROUTER_MODELS;
    else process.env.NINEROUTER_MODELS = originalModels;
    if (originalDecisionModel === undefined) delete process.env.DECISION_AGENT_LLM_MODEL;
    else process.env.DECISION_AGENT_LLM_MODEL = originalDecisionModel;
    if (originalReviewLimit === undefined) delete process.env.DECISION_AGENT_REVIEW_LIMIT;
    else process.env.DECISION_AGENT_REVIEW_LIMIT = originalReviewLimit;
    if (originalMinLensScore === undefined) delete process.env.DECISION_AGENT_MIN_LENS_SCORE_FOR_REVIEW;
    else process.env.DECISION_AGENT_MIN_LENS_SCORE_FOR_REVIEW = originalMinLensScore;
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

  it('hanya mengirim BUY_CANDIDATE PAPER_READY ke hybrid analyst, bukan EXIT_REVIEW held', async () => {
    const buy = candidate();
    const exit = exitReviewCandidate();
    const refs = ['ruleAction', 'modelValidated'].map((field) => `E:BBCA:${field}`);
    const runner = vi.fn(async (args: { evidence: Array<{ ticker: string }> }) => {
      expect(args.evidence.map((item) => item.ticker)).toEqual(['BBCA']);
      return {
        output: { reviews: [{ ticker: 'BBCA', verdict: 'CHALLENGE' as const, confidence: 'LOW' as const, evidenceRefs: refs, concerns: ['MODEL_UNVALIDATED' as const], nextEvidence: ['NEED_POINT_IN_TIME_VALIDATION' as const] }] },
        inputTokens: 100,
        outputTokens: 20,
      };
    });
    const result = await applyHybridAnalysis({ signals: [exit, buy], heldTickers: new Set(['BMRI']), runner: runner as any });
    expect(result.meta.status).toBe('COMPLETED');
    expect(runner).toHaveBeenCalledTimes(1);
    expect(result.signals.find((signal) => signal.ticker === 'BMRI')?.hybridStatus).toBe('NOT_REVIEWED');
    expect(result.signals.find((signal) => signal.ticker === 'BBCA')?.hybridStatus).toBe('CHALLENGED');
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

  it('fallback ke model berikutnya bila model pertama gagal (exception)', async () => {
    process.env.DECISION_AGENT_LLM_MODEL = 'cc/claude-opus-5,cx/gpt-5.6-sol';
    const signal = candidate();
    const refs = ['ruleAction', 'lensScore', 'coveragePct', 'riskReward', 'modelValidated'].map((field) => `E:BBCA:${field}`);
    const runner = vi.fn(async (args: { model: string }) => {
      if (args.model === 'cc/claude-opus-5') throw new Error('rate_limit_error');
      return {
        output: { reviews: [{ ticker: 'BBCA', verdict: 'CONFIRM' as const, confidence: 'MEDIUM' as const, evidenceRefs: refs, concerns: ['MODEL_UNVALIDATED' as const], nextEvidence: ['NEED_POINT_IN_TIME_VALIDATION' as const] }] },
        inputTokens: 100, outputTokens: 20,
      };
    });
    const result = await applyHybridAnalysis({ signals: [signal], runner });
    expect(runner).toHaveBeenCalledTimes(2);
    expect(result.meta.status).toBe('COMPLETED');
    expect(result.meta.model).toBe('cx/gpt-5.6-sol');
    expect(result.signals[0].hybridStatus).toBe('CONFIRMED');
  });

  it('fallback ke model berikutnya bila model pertama membalas output tak valid (bukan exception)', async () => {
    process.env.DECISION_AGENT_LLM_MODEL = 'cc/claude-sonnet-5,cx/gpt-5.6-sol';
    const signal = candidate();
    const refs = ['ruleAction', 'lensScore', 'coveragePct', 'riskReward', 'modelValidated'].map((field) => `E:BBCA:${field}`);
    const runner = vi.fn(async (args: { model: string }) => {
      if (args.model === 'cc/claude-sonnet-5') {
        return { output: { reviews: [{ ticker: 'BBCA', verdict: 'CONFIRM' as const, confidence: 'HIGH' as const, evidenceRefs: ['E:BBCA:unknownEvidence'], concerns: [], nextEvidence: [] }] }, inputTokens: null, outputTokens: null };
      }
      return {
        output: { reviews: [{ ticker: 'BBCA', verdict: 'CONFIRM' as const, confidence: 'MEDIUM' as const, evidenceRefs: refs, concerns: ['MODEL_UNVALIDATED' as const], nextEvidence: ['NEED_POINT_IN_TIME_VALIDATION' as const] }] },
        inputTokens: 100, outputTokens: 20,
      };
    });
    const result = await applyHybridAnalysis({ signals: [signal], runner });
    expect(runner).toHaveBeenCalledTimes(2);
    expect(result.meta.status).toBe('COMPLETED');
    expect(result.meta.model).toBe('cx/gpt-5.6-sol');
  });

  it('PROVIDER_FAILED hanya setelah SELURUH model di daftar gagal, melaporkan kegagalan terakhir', async () => {
    process.env.DECISION_AGENT_LLM_MODEL = 'cc/claude-opus-5,cc/claude-sonnet-5';
    const runner = vi.fn(async (args: { model: string }) => {
      throw new Error(args.model === 'cc/claude-opus-5' ? 'rate_limit_error' : 'invalid_json_response');
    });
    const result = await applyHybridAnalysis({ signals: [candidate()], runner });
    expect(runner).toHaveBeenCalledTimes(2);
    expect(result.meta.status).toBe('PROVIDER_FAILED');
    expect(result.meta.model).toBe('cc/claude-sonnet-5');
    expect(result.signals[0].hybridStatus).toBe('PROVIDER_FAILED');
  });

  it('menormalisasi output fenced object dari model yang membungkus JSON dalam markdown', async () => {
    const signal = candidate();
    const refs = ['ruleAction', 'modelValidated'].map((field) => `E:BBCA:${field}`);
    const runner = vi.fn(async () => ({
      output: `\`\`\`json\n{"reviews":[{"ticker":"BBCA","verdict":"CHALLENGE","confidence":"MEDIUM","evidenceRefs":${JSON.stringify(refs)},"concerns":["MODEL_UNVALIDATED"],"nextEvidence":["NEED_POINT_IN_TIME_VALIDATION"]}]}\n\`\`\``,
      inputTokens: 100,
      outputTokens: 80,
    }));
    const result = await applyHybridAnalysis({ signals: [signal], runner: runner as any });
    expect(result.meta.status).toBe('COMPLETED');
    expect(result.signals[0].hybridStatus).toBe('CHALLENGED');
    expect(result.signals[0].hybridReview?.confidence).toBe('MEDIUM');
  });

  it('menormalisasi output array langsung dari model yang tidak membungkus reviews', async () => {
    const signal = candidate();
    const refs = ['ruleAction', 'modelValidated'].map((field) => `E:BBCA:${field}`);
    const runner = vi.fn(async () => ({
      output: `\`\`\`json\n[{"ticker":"BBCA","verdict":"CHALLENGE","confidence":"LOW","evidenceRefs":${JSON.stringify(refs)},"concerns":["MODEL_UNVALIDATED"],"nextEvidence":[]}]\n\`\`\``,
      inputTokens: 100,
      outputTokens: 80,
    }));
    const result = await applyHybridAnalysis({ signals: [signal], runner: runner as any });
    expect(result.meta.status).toBe('COMPLETED');
    expect(result.signals[0].hybridStatus).toBe('CHALLENGED');
  });

  it('menormalisasi output reason-only dengan default aman untuk field schema yang hilang', async () => {
    const signal = candidate();
    const refs = ['ruleAction', 'modelValidated'].map((field) => `E:BBCA:${field}`);
    const runner = vi.fn(async () => ({
      output: { reviews: [{ ticker: 'BBCA', verdict: 'CHALLENGE', reason: 'Model belum tervalidasi.', evidenceRefs: refs }] },
      inputTokens: 100,
      outputTokens: 80,
    }));
    const result = await applyHybridAnalysis({ signals: [signal], runner: runner as any });
    expect(result.meta.status).toBe('COMPLETED');
    expect(result.signals[0].hybridStatus).toBe('CHALLENGED');
    expect(result.signals[0].hybridReview).toMatchObject({ confidence: 'LOW', concerns: ['MODEL_UNVALIDATED'], nextEvidence: ['NEED_POINT_IN_TIME_VALIDATION'] });
  });

  it('tidak memanggil LLM untuk snapshot stale', async () => {
    const stale = { ...candidate(), stale: true, paperReadiness: 'RESEARCH_ONLY' as const };
    const runner = vi.fn();
    const result = await applyHybridAnalysis({ signals: [stale], runner });
    expect(runner).not.toHaveBeenCalled();
    expect(result.meta.status).toBe('SKIPPED_NO_ELIGIBLE_SIGNALS');
  });

  it('hanya mengirim maksimal 10 kandidat ke hybrid analyst', async () => {
    const signals = Array.from({ length: 12 }, (_, index) => ({
      ...candidate({ symbol: `T${String(index + 1).padStart(3, '0')}.JK`, totalScore: 82 }),
      ticker: `T${String(index + 1).padStart(3, '0')}`,
    }));
    const runner = vi.fn(async (args: { evidence: Array<{ ticker: string }> }) => {
      expect(args.evidence).toHaveLength(10);
      const tickers = args.evidence.map((item) => item.ticker);
      expect(tickers).toEqual(signals.slice(0, 10).map((signal) => signal.ticker));
      return {
        output: { reviews: tickers.map((ticker) => ({ ticker, verdict: 'CHALLENGE' as const, confidence: 'LOW' as const, evidenceRefs: [`E:${ticker}:ruleAction`, `E:${ticker}:modelValidated`], concerns: ['MODEL_UNVALIDATED' as const], nextEvidence: ['NEED_POINT_IN_TIME_VALIDATION' as const] })) },
        inputTokens: 100,
        outputTokens: 20,
      };
    });

    const result = await applyHybridAnalysis({ signals, runner: runner as any });

    expect(runner).toHaveBeenCalledTimes(1);
    expect(result.meta.status).toBe('COMPLETED');
    expect(result.meta.reviewedCount).toBe(10);
  });

  it('melewati kandidat dengan LensScore di bawah 75 sebelum memanggil hybrid analyst', async () => {
    const low = { ...candidate({ symbol: 'LOW.JK', totalScore: 74 }), ticker: 'LOW' };
    const pass = { ...candidate({ symbol: 'PASS.JK', totalScore: 75 }), ticker: 'PASS' };
    const runner = vi.fn(async (args: { evidence: Array<{ ticker: string }> }) => {
      expect(args.evidence.map((item) => item.ticker)).toEqual(['PASS']);
      return {
        output: { reviews: [{ ticker: 'PASS', verdict: 'CHALLENGE' as const, confidence: 'LOW' as const, evidenceRefs: ['E:PASS:ruleAction', 'E:PASS:modelValidated'], concerns: ['MODEL_UNVALIDATED' as const], nextEvidence: ['NEED_POINT_IN_TIME_VALIDATION' as const] }] },
        inputTokens: 100,
        outputTokens: 20,
      };
    });

    const result = await applyHybridAnalysis({ signals: [low, pass], runner: runner as any });

    expect(runner).toHaveBeenCalledTimes(1);
    expect(result.meta.status).toBe('COMPLETED');
    expect(result.meta.reviewedCount).toBe(1);
  });

  it('mengizinkan preset live menaikkan batas LensScore minimum ke 80 lewat env', async () => {
    process.env.DECISION_AGENT_MIN_LENS_SCORE_FOR_REVIEW = '80';
    const low = { ...candidate({ symbol: 'LOW.JK', totalScore: 79 }), ticker: 'LOW' };
    const pass = { ...candidate({ symbol: 'PASS.JK', totalScore: 80 }), ticker: 'PASS' };
    const runner = vi.fn(async (args: { evidence: Array<{ ticker: string }> }) => {
      expect(args.evidence.map((item) => item.ticker)).toEqual(['PASS']);
      return {
        output: { reviews: [{ ticker: 'PASS', verdict: 'CHALLENGE' as const, confidence: 'LOW' as const, evidenceRefs: ['E:PASS:ruleAction', 'E:PASS:modelValidated'], concerns: ['MODEL_UNVALIDATED' as const], nextEvidence: ['NEED_POINT_IN_TIME_VALIDATION' as const] }] },
        inputTokens: 100,
        outputTokens: 20,
      };
    });

    const result = await applyHybridAnalysis({ signals: [low, pass], runner: runner as any });

    expect(runner).toHaveBeenCalledTimes(1);
    expect(result.meta.status).toBe('COMPLETED');
    expect(result.meta.reviewedCount).toBe(1);
  });
});
