import { describe, expect, it } from 'vitest';
import {
  countValidationPopulationRejection,
  emptyValidationPopulationCounters,
  MIN_VALIDATION_COVERAGE_PCT,
  rejectFromValidationPopulation,
} from '../validation-population';
import { MIN_COVERAGE_FOR_RECOMMENDATION } from '@/modules/eligibility';

// REGRESI H-01 (audit kuantitatif 2026-08-11): populasi backtest harus sama dengan
// populasi yang benar-benar bisa direkomendasikan produksi.

describe('rejectFromValidationPopulation', () => {
  const eligible = { coverage_pct: 100, eligibility_status: 'ELIGIBLE' };

  it('meloloskan baris yang lengkap dan layak', () => {
    expect(rejectFromValidationPopulation(eligible)).toBeNull();
  });

  it('menolak kelengkapan data di bawah ambang rekomendasi produksi', () => {
    expect(rejectFromValidationPopulation({ ...eligible, coverage_pct: MIN_VALIDATION_COVERAGE_PCT - 1 }))
      .toBe('LOW_COVERAGE');
    expect(rejectFromValidationPopulation({ ...eligible, coverage_pct: MIN_VALIDATION_COVERAGE_PCT }))
      .toBeNull();
  });

  it('memakai ambang yang SAMA dengan gerbang produksi, bukan salinannya', () => {
    // Kalau assertion ini gagal, ambang backtest dan ambang rekomendasi sudah berpisah -
    // yaitu keadaan yang temuan H-01 laporkan.
    expect(MIN_VALIDATION_COVERAGE_PCT).toBe(MIN_COVERAGE_FOR_RECOMMENDATION);
  });

  it('menolak status kelayakan apa pun selain ELIGIBLE', () => {
    for (const status of ['LOW_LIQUIDITY', 'INSUFFICIENT_HISTORY', 'STALE_DATA', 'POSSIBLY_NOT_TRADED', 'INSUFFICIENT_DATA']) {
      expect(rejectFromValidationPopulation({ ...eligible, eligibility_status: status })).toBe('NOT_ELIGIBLE');
    }
  });

  it('FAIL-CLOSED: baris lama tanpa kolom gerbang ditolak, bukan diloloskan', () => {
    expect(rejectFromValidationPopulation({})).toBe('UNKNOWN_COVERAGE');
    expect(rejectFromValidationPopulation({ coverage_pct: null, eligibility_status: 'ELIGIBLE' })).toBe('UNKNOWN_COVERAGE');
    expect(rejectFromValidationPopulation({ coverage_pct: 100 })).toBe('UNKNOWN_ELIGIBILITY');
    expect(rejectFromValidationPopulation({ coverage_pct: 100, eligibility_status: '  ' })).toBe('UNKNOWN_ELIGIBILITY');
  });

  it('menerima NUMERIC Postgres yang kembali sebagai string', () => {
    expect(rejectFromValidationPopulation({ coverage_pct: '100', eligibility_status: 'ELIGIBLE' })).toBeNull();
    expect(rejectFromValidationPopulation({ coverage_pct: '40', eligibility_status: 'ELIGIBLE' })).toBe('LOW_COVERAGE');
    expect(rejectFromValidationPopulation({ coverage_pct: 'entah', eligibility_status: 'ELIGIBLE' })).toBe('UNKNOWN_COVERAGE');
  });
});

describe('countValidationPopulationRejection', () => {
  it('mencatat tiap alasan terpisah dan melaporkan apakah baris ditolak', () => {
    const counters = emptyValidationPopulationCounters();
    expect(countValidationPopulationRejection(counters, null)).toBe(false);
    expect(countValidationPopulationRejection(counters, 'LOW_COVERAGE')).toBe(true);
    countValidationPopulationRejection(counters, 'LOW_COVERAGE');
    countValidationPopulationRejection(counters, 'NOT_ELIGIBLE');
    countValidationPopulationRejection(counters, 'UNKNOWN_COVERAGE');
    countValidationPopulationRejection(counters, 'UNKNOWN_ELIGIBILITY');
    expect(counters).toEqual({ lowCoverage: 2, unknownCoverage: 1, notEligible: 1, unknownEligibility: 1 });
  });
});
