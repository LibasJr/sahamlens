import { describe, expect, it } from 'vitest';
import { LENS_SCORE_MODEL_METADATA } from '@/modules/technical/config/lens-score-model';
import {
  attachLensScoreModel,
  buildRecommendationAuditTrail,
  buildStockDataQualityContract,
  validateNoDummyStockPayload,
} from '../stock-analysis-contract.service';
import type { ScoringResult } from '../scoring.service';

function scoring(extra: Partial<ScoringResult> = {}): ScoringResult {
  return {
    simbol: 'BBCA',
    harga: 9000,
    technical_score: 30,
    fundamental_score: 20,
    flow_score: 20,
    total_score: 70,
    coverage_pct: 88,
    available_max: { technical: 40, fundamental: 30, flow: 30 },
    kategori: 'BUY',
    detail: {
      ma_trend: 10, rsi: 5, macd: 5, volume: 5,
      valuasi: 5, profitabilitas: 5, kesehatan: 5,
      flow_tekanan: 5, flow_persistensi: 5,
    },
    missing: [],
    not_applicable: [],
    alasan_3_poin: ['Trend positif'],
    risk: 'Normal',
    explainability: {
      research_label: 'LAYAK PANTAU',
      confidence_level: 'SEDANG',
      confidence_score: 72,
      score_band: '60-75',
      actionability: 'INFORMATIONAL_SIGNAL',
      weights: {
        technical: { declared: 40, available: 40, score: 30 },
        fundamental: { declared: 30, available: 25, score: 20 },
        flow: { declared: 30, available: 23, score: 20 },
      },
      positive_drivers: [],
      negative_drivers: [],
      risk_flags: ['MODEL_UNVALIDATED'],
      data_gaps: ['pbv'],
    },
    ...extra,
  };
}

describe('stock analysis backend contract', () => {
  it('menandai source, lastUpdated, staleReason, dan no-dummy policy secara eksplisit', () => {
    const quality = buildStockDataQualityContract({
      source: 'YAHOO_CHART',
      dataTimestamp: null,
      calculatedAt: '2026-08-28T00:00:00.000Z',
      freshness: 'UNKNOWN',
      criticalGaps: ['pbv'],
    });

    expect(quality).toEqual(expect.objectContaining({
      source: 'YAHOO_CHART',
      lastUpdated: null,
      freshness: 'UNKNOWN',
      staleReason: 'PROVIDER_TIMESTAMP_MISSING',
    }));
    expect(quality.noDummyPolicy.mode).toBe('FAIL_CLOSED');
    expect(quality.criticalGaps).toContain('PROVIDER_TIMESTAMP_MISSING');
  });

  it('menolak payload sukses yang tidak memenuhi kontrak no-dummy', () => {
    const quality = buildStockDataQualityContract({
      source: 'YAHOO_CHART',
      dataTimestamp: '2026-08-28T00:00:00.000Z',
      calculatedAt: '2026-08-28T00:00:01.000Z',
      freshness: 'EOD',
    });

    expect(validateNoDummyStockPayload({ price: 9000, scoring: { total_score: 71 }, dataQuality: quality })).toEqual({ ok: true });
    expect(validateNoDummyStockPayload({ price: 0, scoring: { total_score: 71 }, dataQuality: quality })).toEqual({
      ok: false,
      reason: 'PRICE_MISSING_OR_INVALID',
    });
    expect(validateNoDummyStockPayload({ price: 9000, scoring: { total_score: 71 } })).toEqual({
      ok: false,
      reason: 'NO_DUMMY_CONTRACT_MISSING',
    });
  });

  it('menempelkan versi model di dekat hasil scoring dan audit trail', () => {
    const baseScoring = scoring();
    const withModel = attachLensScoreModel(baseScoring);
    const quality = buildStockDataQualityContract({
      source: 'YAHOO_CHART',
      dataTimestamp: '2026-08-28T00:00:00.000Z',
      calculatedAt: '2026-08-28T00:00:01.000Z',
      freshness: 'EOD',
    });
    const audit = buildRecommendationAuditTrail({
      ticker: 'BBCA.JK',
      createdAt: '2026-08-28T00:00:01.000Z',
      dataQuality: quality,
      scoring: baseScoring,
      decision: { advisory: false, action: null, reasonCodes: ['MODEL_UNVALIDATED'] },
      lensScoreInputs: {
        technical: { rsi: { value: 55 }, ma20: { value: 8900 } },
        fundamental: { per: { value: 18 }, pbv: { value: null } },
        flow: { cmf20: { value: 12 } },
      },
    });

    expect(withModel.model_version).toBe(LENS_SCORE_MODEL_METADATA.version);
    expect(withModel.score_config_hash).toBe(LENS_SCORE_MODEL_METADATA.configHash);
    expect(audit.model).toBe(LENS_SCORE_MODEL_METADATA);
    expect(audit.data.source).toBe('YAHOO_CHART');
    expect(audit.inputs.technical).toEqual(['ma20', 'rsi']);
    expect(audit.inputs.fundamental).toEqual(['per']);
    expect(audit.dataGaps).toEqual(['pbv']);
  });
});
