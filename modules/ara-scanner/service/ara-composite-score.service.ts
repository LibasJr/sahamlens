import { ARA_SCANNER_POLICY } from '../config/ara-scanner-policy';

export type AraAcsComponentKey = 'V' | 'C' | 'B' | 'R' | 'T' | 'RS' | 'S' | 'K';

export type AraAcsComponents = Partial<Record<AraAcsComponentKey, number>>;

export interface AraAcsPenalties {
  rejection: number;
  failedBreakout: number;
  multiDayExtension: number;
}

export type AraAcsBand = 'HIGH' | 'MODERATE-HIGH' | 'WATCH' | 'LOW';

export interface AraCompositeScoreResult {
  acs: number;
  baseAcs: number;
  totalPenalty: number;
  availableComponentWeight: number;
  missingComponents: AraAcsComponentKey[];
  band: AraAcsBand;
  version: typeof ARA_SCANNER_POLICY.version;
  lifecycle: typeof ARA_SCANNER_POLICY.lifecycle;
  isProbability: false;
}

function assertUnitScore(key: string, value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`Komponen ACS ${key} wajib berupa angka 0-1`);
  }
}

function assertPenalty(key: string, value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`Penalti ACS ${key} wajib berupa angka non-negatif dalam poin ACS`);
  }
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

export function classifyAraCompositeScore(acs: number): AraAcsBand {
  if (acs >= 80) return 'HIGH';
  if (acs >= 65) return 'MODERATE-HIGH';
  if (acs >= 50) return 'WATCH';
  return 'LOW';
}

/**
 * Pure ACS v0.3 calculation. This function does not fetch data, rank candidates,
 * or authorize execution. Callers must pass the readiness/data gate first.
 * Missing components are reported and contribute zero after the 75% coverage
 * gate passes. They are never filled with a neutral value and the remaining
 * weights are not renormalized, preserving parity with the Hermes engine.
 */
export function calculateAraCompositeScore(input: {
  components: AraAcsComponents;
  penalties: AraAcsPenalties;
}): AraCompositeScoreResult {
  const components = input.components as Record<string, unknown>;
  let weightedUnitScore = 0;
  let availableComponentWeight = 0;
  const missingComponents: AraAcsComponentKey[] = [];

  for (const component of ARA_SCANNER_POLICY.formula.components) {
    const value = components[component.key];
    if (value == null) {
      missingComponents.push(component.key);
      continue;
    }
    assertUnitScore(component.key, value);
    weightedUnitScore += component.weight * value;
    availableComponentWeight += component.weight;
  }

  if (availableComponentWeight + Number.EPSILON < ARA_SCANNER_POLICY.dataGate.minimumAvailableWeight) {
    throw new RangeError(
      `Bobot komponen ACS tersedia minimal ${ARA_SCANNER_POLICY.dataGate.minimumAvailableWeight}`,
    );
  }

  const penalties = input.penalties as unknown as Record<string, unknown>;
  let totalPenalty = 0;
  for (const penalty of ARA_SCANNER_POLICY.formula.penalties) {
    const value = penalties[penalty.key];
    assertPenalty(penalty.key, value);
    totalPenalty += value;
  }

  const baseAcs = roundScore(100 * weightedUnitScore);
  const acs = roundScore(Math.max(0, Math.min(100, baseAcs - totalPenalty)));

  return {
    acs,
    baseAcs,
    totalPenalty: roundScore(totalPenalty),
    availableComponentWeight: roundScore(availableComponentWeight),
    missingComponents,
    band: classifyAraCompositeScore(acs),
    version: ARA_SCANNER_POLICY.version,
    lifecycle: ARA_SCANNER_POLICY.lifecycle,
    isProbability: false,
  };
}
