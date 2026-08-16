import { getValuationMacroAuditStatus } from './valuation-assumption.service';

export const MACRO_BETA_SCENARIOS = [0.5, 0.8, 1, 1.2, 1.5, 2] as const;

export interface MacroCostOfEquityScenario {
  beta: number;
  productionPct: number;
  evidencePct: number | null;
  deltaPp: number | null;
}

export interface MacroAdoptionAnalysis {
  status: 'EVIDENCE_INCOMPLETE' | 'BLOCKED_DOMAIN_ERROR' | 'REVIEW_REQUIRED';
  autoAdopt: false;
  production: {
    riskFreeRatePct: number;
    equityRiskPremiumPct: number;
    maxPerpetualGrowthPct: number;
    setOn: string;
  };
  candidate: {
    riskFreeRatePct: number | null;
    equityRiskPremiumPct: number | null;
    maxPerpetualGrowthPct: number | null;
  };
  scenarios: MacroCostOfEquityScenario[];
  diagnostics: {
    complete: boolean;
    allCandidateValuesNonNegative: boolean;
    terminalGrowthBelowLowestScenarioCostOfEquity: boolean | null;
    largestAbsoluteCostOfEquityDeltaPp: number | null;
  };
  reasons: string[];
}

function round(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function calculateCostOfEquityPct(riskFreeRatePct: number, equityRiskPremiumPct: number, beta: number): number {
  return riskFreeRatePct + beta * equityRiskPremiumPct;
}

export function buildMacroAdoptionAnalysis(input: {
  production: { riskFreeRatePct: number; equityRiskPremiumPct: number; maxPerpetualGrowthPct: number; setOn: string };
  candidate: { riskFreeRatePct: number | null; equityRiskPremiumPct: number | null; maxPerpetualGrowthPct: number | null };
}): MacroAdoptionAnalysis {
  const { production, candidate } = input;
  const complete = candidate.riskFreeRatePct != null && candidate.equityRiskPremiumPct != null && candidate.maxPerpetualGrowthPct != null;
  const candidateValues = [candidate.riskFreeRatePct, candidate.equityRiskPremiumPct, candidate.maxPerpetualGrowthPct].filter((v): v is number => v != null);
  const allCandidateValuesNonNegative = candidateValues.every((value) => Number.isFinite(value) && value >= 0);

  const scenarios = MACRO_BETA_SCENARIOS.map((beta) => {
    const productionPct = calculateCostOfEquityPct(production.riskFreeRatePct, production.equityRiskPremiumPct, beta);
    const evidencePct = complete
      ? calculateCostOfEquityPct(candidate.riskFreeRatePct!, candidate.equityRiskPremiumPct!, beta)
      : null;
    return {
      beta,
      productionPct: round(productionPct),
      evidencePct: evidencePct == null ? null : round(evidencePct),
      deltaPp: evidencePct == null ? null : round(evidencePct - productionPct),
    };
  });

  const evidenceCosts = scenarios.map((row) => row.evidencePct).filter((v): v is number => v != null);
  const terminalGrowthBelowLowestScenarioCostOfEquity = complete && evidenceCosts.length
    ? candidate.maxPerpetualGrowthPct! < Math.min(...evidenceCosts)
    : null;
  const deltas = scenarios.map((row) => row.deltaPp).filter((v): v is number => v != null);
  const largestAbsoluteCostOfEquityDeltaPp = deltas.length ? round(Math.max(...deltas.map(Math.abs))) : null;

  const reasons: string[] = [];
  let status: MacroAdoptionAnalysis['status'];
  if (!complete) {
    status = 'EVIDENCE_INCOMPLETE';
    reasons.push('Risk-free, ERP, dan perpetual-growth evidence harus lengkap sebelum candidate model dapat dievaluasi.');
  } else if (!allCandidateValuesNonNegative || terminalGrowthBelowLowestScenarioCostOfEquity === false) {
    status = 'BLOCKED_DOMAIN_ERROR';
    if (!allCandidateValuesNonNegative) reasons.push('Candidate mengandung nilai negatif/tidak finite yang tidak valid untuk adoption gate.');
    if (terminalGrowthBelowLowestScenarioCostOfEquity === false) reasons.push('Perpetual growth candidate tidak berada di bawah cost of equity terendah pada skenario beta audit; model terminal harus ditinjau.');
  } else {
    status = 'REVIEW_REQUIRED';
    reasons.push('Evidence lengkap dan lolos domain check, tetapi perubahan parameter tetap memerlukan model-version, golden/regression test, dan validation ulang.');
  }
  reasons.push('Tidak ada auto-adoption. Halaman ini hanya menghitung dampak matematis candidate terhadap parameter model.');

  return {
    status,
    autoAdopt: false,
    production,
    candidate,
    scenarios,
    diagnostics: {
      complete,
      allCandidateValuesNonNegative,
      terminalGrowthBelowLowestScenarioCostOfEquity,
      largestAbsoluteCostOfEquityDeltaPp,
    },
    reasons,
  };
}

export async function getMacroAdoptionAnalysis(asOfDate?: string): Promise<MacroAdoptionAnalysis> {
  const audit = await getValuationMacroAuditStatus(asOfDate);
  return buildMacroAdoptionAnalysis({
    production: audit.productionModel,
    candidate: {
      riskFreeRatePct: audit.evidence.riskFree?.valuePct ?? null,
      equityRiskPremiumPct: audit.evidence.erp?.valuePct ?? null,
      maxPerpetualGrowthPct: audit.evidence.growthCap?.valuePct ?? null,
    },
  });
}
