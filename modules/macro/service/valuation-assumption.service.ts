import { MACRO_ASSUMPTIONS } from '@/modules/fundamental/service/fair-multiples.service';
import { getValuationMacroAssumptionAsOf } from '../repository/valuation-assumption.repository';

/**
 * Audit view only. Scoring/valuation production remains pinned to the frozen
 * MACRO_ASSUMPTIONS constant for reproducibility until a scoring-version change
 * explicitly adopts a persisted macro row.
 */
export async function getValuationMacroAuditStatus(asOfDate?: string) {
  const latest = await getValuationMacroAssumptionAsOf(asOfDate);
  return {
    productionModel: {
      riskFreeRatePct: MACRO_ASSUMPTIONS.RISK_FREE_RATE_PCT,
      equityRiskPremiumPct: MACRO_ASSUMPTIONS.EQUITY_RISK_PREMIUM_PCT,
      maxPerpetualGrowthPct: MACRO_ASSUMPTIONS.MAX_PERPETUAL_GROWTH_PCT,
      setOn: MACRO_ASSUMPTIONS.SET_ON,
      mode: 'FROZEN_BY_MODEL_VERSION' as const,
    },
    latestAudited: latest,
    differsFromProduction:
      latest != null &&
      (latest.riskFreeRatePct !== MACRO_ASSUMPTIONS.RISK_FREE_RATE_PCT ||
        latest.equityRiskPremiumPct !== MACRO_ASSUMPTIONS.EQUITY_RISK_PREMIUM_PCT ||
        latest.maxPerpetualGrowthPct !== MACRO_ASSUMPTIONS.MAX_PERPETUAL_GROWTH_PCT),
    guardrail:
      'Nilai macro terbaru tidak diterapkan diam-diam. Perubahan input valuasi wajib menaikkan versi model dan menjalankan regression/backtest ulang.',
  };
}
