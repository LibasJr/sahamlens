import { describe, expect, it } from 'vitest';
import {
  emptyValidationPopulationCounters,
  MIN_VALIDATION_COVERAGE_PCT,
  countValidationPopulationRejection,
  rejectFromValidationPopulation,
} from '../validation-population';

const eligible = { coverage_pct: 100, eligibility_status: 'ELIGIBLE', universe_eligible: true };

describe('rejectFromValidationPopulation', () => {
  it('accepts only production-eligible PIT rows', () => expect(rejectFromValidationPopulation(eligible)).toBeNull());
  it('rejects low coverage', () => {
    expect(rejectFromValidationPopulation({ ...eligible, coverage_pct: MIN_VALIDATION_COVERAGE_PCT - 1 })).toBe('LOW_COVERAGE');
    expect(rejectFromValidationPopulation({ ...eligible, coverage_pct: MIN_VALIDATION_COVERAGE_PCT })).toBeNull();
  });
  it('rejects non-eligible statuses', () => {
    for (const status of ['LOW_LIQUIDITY', 'STALE_DATA', 'INSUFFICIENT_DATA']) {
      expect(rejectFromValidationPopulation({ ...eligible, eligibility_status: status })).toBe('NOT_ELIGIBLE');
    }
  });
  it('fails closed on unknown audit fields', () => {
    expect(rejectFromValidationPopulation({})).toBe('UNKNOWN_COVERAGE');
    expect(rejectFromValidationPopulation({ coverage_pct: 100 })).toBe('UNKNOWN_ELIGIBILITY');
    expect(rejectFromValidationPopulation({ coverage_pct: 100, eligibility_status: 'ELIGIBLE' })).toBe('UNKNOWN_PIT_UNIVERSE');
  });
  it('rejects rows outside the PIT universe', () => {
    expect(rejectFromValidationPopulation({ ...eligible, universe_eligible: false })).toBe('OUTSIDE_PIT_UNIVERSE');
  });
  it('parses postgres-like string/number booleans', () => {
    expect(rejectFromValidationPopulation({ coverage_pct: '100', eligibility_status: 'ELIGIBLE', universe_eligible: 'true' })).toBeNull();
  });
  it('counts new PIT rejection reasons', () => {
    const counters = emptyValidationPopulationCounters();
    expect(countValidationPopulationRejection(counters, 'OUTSIDE_PIT_UNIVERSE')).toBe(true);
    expect(countValidationPopulationRejection(counters, 'UNKNOWN_PIT_UNIVERSE')).toBe(true);
    expect(counters.outsidePitUniverse).toBe(1);
    expect(counters.unknownPitUniverse).toBe(1);
  });
});
