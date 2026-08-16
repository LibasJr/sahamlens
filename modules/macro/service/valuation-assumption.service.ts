import { MACRO_ASSUMPTIONS } from '@/modules/fundamental/service/fair-multiples.service';
import {
  getMacroInputEvidenceAsOf,
  type MacroInputEvidence,
  type MacroInputKey,
} from '../repository/valuation-assumption.repository';

const VALUATION_KEYS = [
  'RISK_FREE_RATE_PCT',
  'EQUITY_RISK_PREMIUM_PCT',
  'MAX_PERPETUAL_GROWTH_PCT',
] as const satisfies readonly MacroInputKey[];

const CONTEXT_KEYS = [
  'BI_RATE_PCT',
  'INFLATION_TARGET_MID_PCT',
  'INFLATION_TARGET_UPPER_PCT',
] as const satisfies readonly MacroInputKey[];

function differs(evidence: MacroInputEvidence | null, productionValue: number): boolean {
  return evidence != null && Math.abs(evidence.valuePct - productionValue) > 1e-9;
}

/**
 * Audit-only status. Evidence is PIT and provenance-aware, but production valuation
 * remains pinned to MACRO_ASSUMPTIONS until an explicit model-version adoption.
 */
export async function getValuationMacroAuditStatus(asOfDate?: string) {
  const [riskFree, erp, growthCap, biRate, inflationMid, inflationUpper] = await Promise.all([
    getMacroInputEvidenceAsOf('RISK_FREE_RATE_PCT', asOfDate),
    getMacroInputEvidenceAsOf('EQUITY_RISK_PREMIUM_PCT', asOfDate),
    getMacroInputEvidenceAsOf('MAX_PERPETUAL_GROWTH_PCT', asOfDate),
    getMacroInputEvidenceAsOf('BI_RATE_PCT', asOfDate),
    getMacroInputEvidenceAsOf('INFLATION_TARGET_MID_PCT', asOfDate),
    getMacroInputEvidenceAsOf('INFLATION_TARGET_UPPER_PCT', asOfDate),
  ]);

  const evidence = { riskFree, erp, growthCap };
  const complete = VALUATION_KEYS.every((key) => {
    if (key === 'RISK_FREE_RATE_PCT') return riskFree != null;
    if (key === 'EQUITY_RISK_PREMIUM_PCT') return erp != null;
    return growthCap != null;
  });
  const contextComplete = CONTEXT_KEYS.every((key) => {
    if (key === 'BI_RATE_PCT') return biRate != null;
    if (key === 'INFLATION_TARGET_MID_PCT') return inflationMid != null;
    return inflationUpper != null;
  });

  return {
    productionModel: {
      riskFreeRatePct: MACRO_ASSUMPTIONS.RISK_FREE_RATE_PCT,
      equityRiskPremiumPct: MACRO_ASSUMPTIONS.EQUITY_RISK_PREMIUM_PCT,
      maxPerpetualGrowthPct: MACRO_ASSUMPTIONS.MAX_PERPETUAL_GROWTH_PCT,
      setOn: MACRO_ASSUMPTIONS.SET_ON,
      mode: 'FROZEN_BY_MODEL_VERSION' as const,
    },
    evidence,
    macroContext: { biRate, inflationMid, inflationUpper },
    complete,
    contextComplete,
    differsFromProduction: {
      riskFree: differs(riskFree, MACRO_ASSUMPTIONS.RISK_FREE_RATE_PCT),
      erp: differs(erp, MACRO_ASSUMPTIONS.EQUITY_RISK_PREMIUM_PCT),
      growthCap: differs(growthCap, MACRO_ASSUMPTIONS.MAX_PERPETUAL_GROWTH_PCT),
    },
    adoptionStatus: 'NOT_ADOPTED_REQUIRES_MODEL_VERSION' as const,
    guardrail:
      'Evidence terbaru tidak diterapkan diam-diam. Adopsi risk-free/ERP/growth cap wajib menaikkan versi model, menjalankan golden/regression test, dan mengulang validation/backtest yang relevan.',
  };
}
