import { MIN_COVERAGE_FOR_RECOMMENDATION } from '@/modules/eligibility';

// SIAPA YANG BOLEH MASUK POPULASI VALIDASI - satu definisi, dipakai bucket backtest,
// calibration lab, dan (lewat calibration) halaman Transparency.
//
// BUG FIX (audit kuantitatif 2026-08-11, temuan H-01): sebelumnya tidak ada gerbang ini
// sama sekali. Produksi menolak memberi rekomendasi kalau `coverage_pct` di bawah 55%
// (getKategori -> 'DATA TIDAK CUKUP') atau kalau evaluateMinimalEligibility() tidak
// mengembalikan ELIGIBLE - histori < 200 bar, kemungkinan tidak diperdagangkan, data
// basi, likuiditas di bawah lantai. Backtest tidak menerapkan satu pun dari itu.
//
// Akibatnya tabel bucket, t-test, dan equity curve di halaman Transparency publik
// menghitung sinyal yang aplikasinya sendiri TIDAK AKAN PERNAH rekomendasikan. Pembaca
// menafsirkannya sebagai "kalau saya beli saham skor 80+, historisnya begini" - padahal
// sebagian sinyal di angka itu tidak pernah bisa ia terima.
//
// Ambangnya sengaja DI-IMPOR dari gerbang produksi, bukan ditulis ulang. Kalau produksi
// menaikkan ambang kelengkapan dan angka di sini tertinggal, backtest kembali mengukur
// populasi yang berbeda - persis kegagalan yang gerbang ini ada untuk mencegahnya.

export type ValidationPopulationRejection =
  | 'LOW_COVERAGE'
  | 'UNKNOWN_COVERAGE'
  | 'NOT_ELIGIBLE'
  | 'UNKNOWN_ELIGIBILITY';

export interface ValidationPopulationRow {
  coverage_pct?: number | string | null;
  eligibility_status?: string | null;
}

export interface ValidationPopulationCounters {
  lowCoverage: number;
  unknownCoverage: number;
  notEligible: number;
  unknownEligibility: number;
}

export function emptyValidationPopulationCounters(): ValidationPopulationCounters {
  return { lowCoverage: 0, unknownCoverage: 0, notEligible: 0, unknownEligibility: 0 };
}

export const MIN_VALIDATION_COVERAGE_PCT = MIN_COVERAGE_FOR_RECOMMENDATION;

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * `null` = baris boleh masuk populasi validasi. Selain itu, alasan penolakannya.
 *
 * FAIL-CLOSED untuk yang tidak diketahui. Baris yang diarsipkan sebelum kolom
 * `coverage_pct`/`eligibility_status` ada TIDAK diloloskan: "kita tidak tahu apakah
 * sinyal ini layak" bukan sinonim dari "layak". Meloloskannya akan mengembalikan persis
 * masalah yang gerbang ini tutup, hanya lewat pintu yang lebih sunyi.
 */
export function rejectFromValidationPopulation(
  row: ValidationPopulationRow
): ValidationPopulationRejection | null {
  const coverage = numberOrNull(row.coverage_pct ?? null);
  if (coverage == null) return 'UNKNOWN_COVERAGE';
  if (coverage < MIN_VALIDATION_COVERAGE_PCT) return 'LOW_COVERAGE';

  const eligibility = typeof row.eligibility_status === 'string' ? row.eligibility_status.trim() : '';
  if (!eligibility) return 'UNKNOWN_ELIGIBILITY';
  if (eligibility !== 'ELIGIBLE') return 'NOT_ELIGIBLE';

  return null;
}

/** Catat penolakan ke penghitung. Mengembalikan `true` kalau baris ditolak. */
export function countValidationPopulationRejection(
  counters: ValidationPopulationCounters,
  rejection: ValidationPopulationRejection | null
): boolean {
  if (rejection === null) return false;
  if (rejection === 'LOW_COVERAGE') counters.lowCoverage++;
  else if (rejection === 'UNKNOWN_COVERAGE') counters.unknownCoverage++;
  else if (rejection === 'NOT_ELIGIBLE') counters.notEligible++;
  else counters.unknownEligibility++;
  return true;
}
