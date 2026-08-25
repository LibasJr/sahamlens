import type { DecisionShadowCohort } from '../types/decision-agent.types';

export interface ShadowObservation {
  verdict: string;
  t5: number | null;
  t20: number | null;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function aggregateShadowCohorts(rows: ShadowObservation[]): DecisionShadowCohort[] {
  const cohortNames: DecisionShadowCohort['cohort'][] = [
    'RULE_ALL', 'CONFIRM', 'CHALLENGE', 'INSUFFICIENT_EVIDENCE', 'NOT_REVIEWED',
  ];
  return cohortNames.map((cohort) => {
    const cohortRows = cohort === 'RULE_ALL' ? rows : rows.filter((row) => row.verdict === cohort);
    const t5 = cohortRows.map((row) => row.t5).filter((value): value is number => value != null);
    const t20 = cohortRows.map((row) => row.t20).filter((value): value is number => value != null);
    return {
      cohort,
      t5Count: t5.length,
      t5AverageReturnPct: average(t5),
      t5HitRatePct: t5.length ? t5.filter((value) => value > 0).length / t5.length * 100 : null,
      t20Count: t20.length,
      t20AverageReturnPct: average(t20),
      t20HitRatePct: t20.length ? t20.filter((value) => value > 0).length / t20.length * 100 : null,
    };
  });
}
