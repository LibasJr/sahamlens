import { pool } from '@/shared/database/postgres.client';
import { logger } from '@/shared/logger/logger';
import type { RecommendationAuditTrail, StockDataQualityContract } from '@/modules/technical/service/stock-analysis-contract.service';

export interface RecommendationAuditRecordInput {
  audit: RecommendationAuditTrail;
  dataQuality: StockDataQualityContract;
  inputSnapshot: Record<string, unknown>;
}

export async function recordRecommendationAuditTrail(input: RecommendationAuditRecordInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO recommendation_audit_trail
       (ticker, model_version, score_config_hash, source_id, data_observed_at, calculated_at,
        total_score, category, coverage_pct, confidence_pct, advisory, action,
        data_quality, input_snapshot, decision_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb)`,
      [
        input.audit.ticker,
        input.audit.model.version,
        input.audit.model.configHash,
        input.dataQuality.source,
        input.dataQuality.lastUpdated,
        input.audit.createdAt,
        input.audit.score.total,
        input.audit.score.category,
        input.audit.score.coveragePct,
        input.audit.score.confidencePct,
        input.audit.decision.advisory,
        input.audit.decision.action,
        JSON.stringify(input.dataQuality),
        JSON.stringify(input.inputSnapshot),
        JSON.stringify(input.audit.decision),
      ],
    );
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    const context = {
      module: 'recommendation-audit',
      ticker: input.audit.ticker,
      code,
      err: error instanceof Error ? error.message : String(error),
    };
    if (code === '42P01') {
      logger.debug('Recommendation audit trail table not migrated yet', context);
      return;
    }
    logger.warn('Recommendation audit trail write skipped', {
      ...context,
    });
  }
}
