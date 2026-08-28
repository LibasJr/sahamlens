import { LENS_SCORE_MODEL_METADATA } from '@/modules/technical/config/lens-score-model';
import type { ScoringResult } from '@/modules/technical/service/scoring.service';
import type { Freshness } from '@/shared/http/freshness';

export const STOCK_ANALYSIS_CONTRACT_VERSION = 'stock-analysis-contract-v1.0.0';
export const RECOMMENDATION_AUDIT_VERSION = 'recommendation-audit-v1.0.0';

export interface StockDataQualityContract {
  contractVersion: typeof STOCK_ANALYSIS_CONTRACT_VERSION;
  source: string;
  lastUpdated: string | null;
  calculatedAt: string;
  freshness: Freshness;
  staleReason: string | null;
  noDummyPolicy: {
    mode: 'FAIL_CLOSED';
    missingNumericValues: 'NULL_NOT_ZERO';
    missingLabels: 'NULL_NOT_SYNTHETIC_LABEL';
  };
  criticalGaps: string[];
}

export interface RecommendationAuditTrail {
  auditVersion: typeof RECOMMENDATION_AUDIT_VERSION;
  ticker: string;
  createdAt: string;
  model: typeof LENS_SCORE_MODEL_METADATA;
  data: Pick<StockDataQualityContract, 'source' | 'lastUpdated' | 'freshness' | 'staleReason'>;
  score: {
    total: number;
    category: ScoringResult['kategori'];
    coveragePct: number;
    confidencePct: number;
    researchLabel: string;
  };
  decision: {
    advisory: boolean;
    action: string | null;
    reasonCodes: string[];
  };
  inputs: {
    technical: string[];
    fundamental: string[];
    flow: string[];
  };
  dataGaps: string[];
  riskFlags: string[];
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function staleReasonForFreshness(freshness: Freshness, dataTimestamp: string | null): string | null {
  if (freshness === 'STALE') return 'PROVIDER_DATA_STALE';
  if (freshness === 'UNKNOWN' || dataTimestamp == null) return 'PROVIDER_TIMESTAMP_MISSING';
  return null;
}

function provenanceKeys(group: Record<string, unknown> | undefined): string[] {
  return Object.entries(group ?? {})
    .filter(([, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      return (value as { value?: unknown }).value != null;
    })
    .map(([key]) => key)
    .sort();
}

export function buildStockDataQualityContract(args: {
  source: string;
  dataTimestamp: string | null;
  calculatedAt: string;
  freshness: Freshness;
  criticalGaps?: string[];
}): StockDataQualityContract {
  const uniqueGaps = Array.from(new Set(args.criticalGaps ?? [])).sort();
  const staleReason = staleReasonForFreshness(args.freshness, args.dataTimestamp);

  return {
    contractVersion: STOCK_ANALYSIS_CONTRACT_VERSION,
    source: args.source,
    lastUpdated: args.dataTimestamp,
    calculatedAt: args.calculatedAt,
    freshness: args.freshness,
    staleReason,
    noDummyPolicy: {
      mode: 'FAIL_CLOSED',
      missingNumericValues: 'NULL_NOT_ZERO',
      missingLabels: 'NULL_NOT_SYNTHETIC_LABEL',
    },
    criticalGaps: staleReason ? Array.from(new Set([...uniqueGaps, staleReason])).sort() : uniqueGaps,
  };
}

export function attachLensScoreModel(scoring: ScoringResult) {
  return {
    ...scoring,
    model_version: LENS_SCORE_MODEL_METADATA.version,
    score_config_hash: LENS_SCORE_MODEL_METADATA.configHash,
    model_status: LENS_SCORE_MODEL_METADATA.status,
  };
}

export function validateNoDummyStockPayload(payload: {
  price?: unknown;
  scoring?: unknown;
  dataQuality?: StockDataQualityContract;
}): { ok: true } | { ok: false; reason: string } {
  if (!finiteNumber(payload.price) || payload.price <= 0) {
    return { ok: false, reason: 'PRICE_MISSING_OR_INVALID' };
  }

  const scoring = payload.scoring && typeof payload.scoring === 'object' && !Array.isArray(payload.scoring)
    ? payload.scoring as Record<string, unknown>
    : null;
  if (!scoring || !finiteNumber(scoring.total_score)) {
    return { ok: false, reason: 'LENS_SCORE_MISSING_OR_INVALID' };
  }

  if (!payload.dataQuality || payload.dataQuality.noDummyPolicy.mode !== 'FAIL_CLOSED') {
    return { ok: false, reason: 'NO_DUMMY_CONTRACT_MISSING' };
  }

  if (payload.dataQuality.source.trim() === '' || /dummy|sample|mock/i.test(payload.dataQuality.source)) {
    return { ok: false, reason: 'SOURCE_NOT_REAL' };
  }

  return { ok: true };
}

export function buildRecommendationAuditTrail(args: {
  ticker: string;
  createdAt: string;
  dataQuality: StockDataQualityContract;
  scoring: ScoringResult;
  decision: { advisory?: unknown; action?: unknown; reasonCodes?: unknown };
  lensScoreInputs: {
    technical?: Record<string, unknown>;
    fundamental?: Record<string, unknown>;
    flow?: Record<string, unknown>;
  };
}): RecommendationAuditTrail {
  const explainability = args.scoring.explainability;
  return {
    auditVersion: RECOMMENDATION_AUDIT_VERSION,
    ticker: args.ticker,
    createdAt: args.createdAt,
    model: LENS_SCORE_MODEL_METADATA,
    data: {
      source: args.dataQuality.source,
      lastUpdated: args.dataQuality.lastUpdated,
      freshness: args.dataQuality.freshness,
      staleReason: args.dataQuality.staleReason,
    },
    score: {
      total: args.scoring.total_score,
      category: args.scoring.kategori,
      coveragePct: args.scoring.coverage_pct,
      confidencePct: explainability.confidence_score,
      researchLabel: explainability.research_label,
    },
    decision: {
      advisory: args.decision.advisory === true,
      action: typeof args.decision.action === 'string' ? args.decision.action : null,
      reasonCodes: Array.isArray(args.decision.reasonCodes)
        ? args.decision.reasonCodes.filter((item): item is string => typeof item === 'string')
        : [],
    },
    inputs: {
      technical: provenanceKeys(args.lensScoreInputs.technical),
      fundamental: provenanceKeys(args.lensScoreInputs.fundamental),
      flow: provenanceKeys(args.lensScoreInputs.flow),
    },
    dataGaps: explainability.data_gaps,
    riskFlags: explainability.risk_flags,
  };
}
