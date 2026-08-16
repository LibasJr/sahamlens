import { describe, expect, it } from 'vitest';
import { buildMacroAdoptionAnalysis, calculateCostOfEquityPct } from '../macro-adoption-analysis.service';

describe('macro adoption analysis', () => {
  it('calculates CAPM cost of equity without auto-adopting candidate evidence', () => {
    expect(calculateCostOfEquityPct(7, 6, 1.2)).toBeCloseTo(14.2, 10);
    const result = buildMacroAdoptionAnalysis({
      production: { riskFreeRatePct: 6.7, equityRiskPremiumPct: 5.2, maxPerpetualGrowthPct: 5, setOn: '2026-01-01' },
      candidate: { riskFreeRatePct: 7.29, equityRiskPremiumPct: 7.38, maxPerpetualGrowthPct: 5 },
    });
    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.autoAdopt).toBe(false);
    expect(result.scenarios.find((row) => row.beta === 1)?.deltaPp).toBeCloseTo(2.77, 6);
    expect(result.diagnostics.terminalGrowthBelowLowestScenarioCostOfEquity).toBe(true);
  });

  it('fails closed when evidence is incomplete', () => {
    const result = buildMacroAdoptionAnalysis({
      production: { riskFreeRatePct: 6.7, equityRiskPremiumPct: 5.2, maxPerpetualGrowthPct: 5, setOn: '2026-01-01' },
      candidate: { riskFreeRatePct: 7.29, equityRiskPremiumPct: null, maxPerpetualGrowthPct: 5 },
    });
    expect(result.status).toBe('EVIDENCE_INCOMPLETE');
    expect(result.scenarios.every((row) => row.evidencePct == null)).toBe(true);
  });

  it('blocks mathematically invalid terminal growth domain', () => {
    const result = buildMacroAdoptionAnalysis({
      production: { riskFreeRatePct: 6, equityRiskPremiumPct: 5, maxPerpetualGrowthPct: 4, setOn: '2026-01-01' },
      candidate: { riskFreeRatePct: 1, equityRiskPremiumPct: 1, maxPerpetualGrowthPct: 3 },
    });
    expect(result.status).toBe('BLOCKED_DOMAIN_ERROR');
    expect(result.diagnostics.terminalGrowthBelowLowestScenarioCostOfEquity).toBe(false);
  });
});
