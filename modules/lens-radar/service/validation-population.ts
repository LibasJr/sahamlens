import { MIN_COVERAGE_FOR_RECOMMENDATION } from '@/modules/eligibility';

// Satu definisi populasi validasi. Coverage + eligibility wajib identik dengan produksi,
// dan membership universe wajib point-in-time (H-01/H-02). Histori lama yang belum punya
// universe_eligible ditolak fail-closed sampai PIT backfill diulang.
export type ValidationPopulationRejection =
  | 'LOW_COVERAGE'
  | 'UNKNOWN_COVERAGE'
  | 'NOT_ELIGIBLE'
  | 'UNKNOWN_ELIGIBILITY'
  | 'OUTSIDE_PIT_UNIVERSE'
  | 'UNKNOWN_PIT_UNIVERSE';

export interface ValidationPopulationRow {
  coverage_pct?: number | string | null;
  eligibility_status?: string | null;
  universe_eligible?: boolean | string | number | null;
}

export interface ValidationPopulationCounters {
  lowCoverage: number;
  unknownCoverage: number;
  notEligible: number;
  unknownEligibility: number;
  outsidePitUniverse: number;
  unknownPitUniverse: number;
}

export function emptyValidationPopulationCounters(): ValidationPopulationCounters {
  return {
    lowCoverage: 0,
    unknownCoverage: 0,
    notEligible: 0,
    unknownEligibility: 0,
    outsidePitUniverse: 0,
    unknownPitUniverse: 0,
  };
}

export const MIN_VALIDATION_COVERAGE_PCT = MIN_COVERAGE_FOR_RECOMMENDATION;

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
function booleanOrNull(value: boolean | string | number | null | undefined): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'TRUE') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'FALSE') return false;
  return null;
}

export function rejectFromValidationPopulation(row: ValidationPopulationRow): ValidationPopulationRejection | null {
  const coverage = numberOrNull(row.coverage_pct ?? null);
  if (coverage == null) return 'UNKNOWN_COVERAGE';
  if (coverage < MIN_VALIDATION_COVERAGE_PCT) return 'LOW_COVERAGE';

  const eligibility = typeof row.eligibility_status === 'string' ? row.eligibility_status.trim() : '';
  if (!eligibility) return 'UNKNOWN_ELIGIBILITY';
  if (eligibility !== 'ELIGIBLE') return 'NOT_ELIGIBLE';

  const pitUniverse = booleanOrNull(row.universe_eligible ?? null);
  if (pitUniverse == null) return 'UNKNOWN_PIT_UNIVERSE';
  if (!pitUniverse) return 'OUTSIDE_PIT_UNIVERSE';
  return null;
}

export function countValidationPopulationRejection(
  counters: ValidationPopulationCounters,
  rejection: ValidationPopulationRejection | null
): boolean {
  if (rejection === null) return false;
  if (rejection === 'LOW_COVERAGE') counters.lowCoverage++;
  else if (rejection === 'UNKNOWN_COVERAGE') counters.unknownCoverage++;
  else if (rejection === 'NOT_ELIGIBLE') counters.notEligible++;
  else if (rejection === 'UNKNOWN_ELIGIBILITY') counters.unknownEligibility++;
  else if (rejection === 'OUTSIDE_PIT_UNIVERSE') counters.outsidePitUniverse++;
  else counters.unknownPitUniverse++;
  return true;
}
