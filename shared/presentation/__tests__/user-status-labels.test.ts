import { describe, expect, it } from 'vitest';
import {
  describeUserAdvisoryStatus,
  describeUserConfidenceLabel,
  describeUserEligibilityFallback,
  describeUserIntegrityStatus,
  describeUserRecommendationStatus,
  describeUserResearchLabel,
  describeUserSignalLabel,
} from '../user-status-labels';

describe('user-status-labels', () => {
  it('menerjemahkan label riset dan confidence ke bahasa pengguna', () => {
    expect(describeUserResearchLabel('RESEARCH_ONLY')).toBe('Untuk riset saja');
    expect(describeUserResearchLabel('MODEL_UNVALIDATED')).toBe('Masih tahap uji');
    expect(describeUserConfidenceLabel('HIGH')).toBe('Keyakinan tinggi');
    expect(describeUserConfidenceLabel('MEDIUM')).toBe('Keyakinan sedang');
  });

  it('menerjemahkan sinyal model tanpa kata transaksi mentah', () => {
    expect(describeUserSignalLabel('BUY')).toBe('Sinyal riset: SINYAL POSITIF');
    expect(describeUserSignalLabel('DATA TIDAK CUKUP')).toBe('Data belum cukup');
  });

  it('menerjemahkan alasan rekomendasi yang belum tersedia', () => {
    expect(describeUserRecommendationStatus(['MODEL_UNVALIDATED'], 'ELIGIBLE')).toBe('Masih tahap uji');
    expect(describeUserRecommendationStatus(['COVERAGE_BELOW_MIN'], 'ELIGIBLE')).toBe('Data belum cukup');
    expect(describeUserRecommendationStatus(['LOW_LIQUIDITY'], 'LOW_LIQUIDITY')).toBe('Belum layak direkomendasikan');
    expect(describeUserEligibilityFallback(null)).toBe('Data belum cukup');
  });

  it('menerjemahkan status integrity tanpa mengekspos kode internal', () => {
    expect(describeUserIntegrityStatus('MATCH')).toMatchObject({ label: 'Harga sudah cocok', caution: false });
    expect(describeUserIntegrityStatus('FAILED')).toMatchObject({ label: 'Verifikasi gagal dijalankan', caution: true });
    expect(describeUserIntegrityStatus('MISMATCH')).toMatchObject({ label: 'Data harga sedang diperiksa', caution: true });
  });

  it('membedakan rencana aktif dan riset saja', () => {
    expect(describeUserAdvisoryStatus(true).label).toBe('Rencana aktif');
    expect(describeUserAdvisoryStatus(false).label).toBe('Untuk riset saja');
  });
});
