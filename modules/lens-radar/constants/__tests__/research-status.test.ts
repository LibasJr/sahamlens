import { describe, expect, it } from 'vitest';
import {
  MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION,
  MIN_VALIDATION_DAYS,
  PRODUCT_VALIDATION_STATUS,
  RESEARCH_ONLY_DISCLAIMER,
  THRESHOLD_RECOMMENDER_ENABLED,
  resolveValidationStatus,
  suppressUnvalidatedSignificance,
} from '../research-status';

/**
 * FASE 0 - SAFETY PATCH (audit Ronde 3, temuan C-1/C-2/C-5).
 *
 * Test ini menjaga satu aturan produk: SELAMA independensi statistik belum terpenuhi,
 * aplikasi TIDAK BOLEH menyatakan hasilnya tervalidasi - berapa pun kecilnya p-value.
 * Dekorelasi per ticker (sudah ada) hanya menutup autokorelasi SERI; korelasi SILANG
 * antar emiten pada tanggal yang sama belum ditangani sama sekali, dan tidak ada
 * pengujian out-of-sample. Keduanya syarat yang belum dipenuhi, bukan detail.
 */
describe('research-status (Fase 0)', () => {
  it('menetapkan status produk RESEARCH_ONLY', () => {
    expect(PRODUCT_VALIDATION_STATUS).toBe('RESEARCH_ONLY');
  });

  it('membekukan rekomendasi ambang otomatis', () => {
    expect(THRESHOLD_RECOMMENDER_ENABLED).toBe(false);
  });

  it('disclaimer tidak mengklaim validasi, terbukti, atau signifikan', () => {
    const lower = RESEARCH_ONLY_DISCLAIMER.toLowerCase();
    expect(lower).not.toContain('tervalidasi');
    expect(lower).not.toContain('terbukti');
    expect(lower).not.toContain('signifikan secara statistik');
    expect(lower).toContain('riset');
  });

  it('NOT_ENOUGH_DATA saat periode validasi masih pendek', () => {
    expect(
      resolveValidationStatus({
        validationDays: MIN_VALIDATION_DAYS - 1,
        effectiveSamples: 500,
        pValue: 0.0001,
        outOfSampleTested: false,
      })
    ).toBe('NOT_ENOUGH_DATA');
  });

  it('NOT_ENOUGH_DATA saat sampel efektif di bawah ambang minimum', () => {
    expect(
      resolveValidationStatus({
        validationDays: 400,
        effectiveSamples: MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION - 1,
        pValue: 0.0001,
        outOfSampleTested: false,
      })
    ).toBe('NOT_ENOUGH_DATA');
  });

  it('EXPLORATORY saat data cukup tapi p-value belum di bawah alpha', () => {
    expect(
      resolveValidationStatus({
        validationDays: 400,
        effectiveSamples: 200,
        pValue: 0.4,
        outOfSampleTested: false,
      })
    ).toBe('EXPLORATORY');
  });

  it('OUT_OF_SAMPLE_PENDING - p-value kecil in-sample BUKAN validasi', () => {
    expect(
      resolveValidationStatus({
        validationDays: 400,
        effectiveSamples: 200,
        pValue: 0.0001,
        outOfSampleTested: false,
      })
    ).toBe('OUT_OF_SAMPLE_PENDING');
  });

  it('TIDAK PERNAH mengembalikan VALIDATED_OUT_OF_SAMPLE selama uji out-of-sample belum dijalankan', () => {
    for (const pValue of [0, 1e-12, 0.0001, 0.01, 0.049]) {
      expect(
        resolveValidationStatus({
          validationDays: 100_000,
          effectiveSamples: 100_000,
          pValue,
          outOfSampleTested: false,
        })
      ).not.toBe('VALIDATED_OUT_OF_SAMPLE');
    }
  });

  it('FAILED_VALIDATION saat uji out-of-sample sudah jalan tapi tidak lolos', () => {
    expect(
      resolveValidationStatus({
        validationDays: 400,
        effectiveSamples: 200,
        pValue: 0.2,
        outOfSampleTested: true,
      })
    ).toBe('FAILED_VALIDATION');
  });

  it('p-value null diperlakukan sebagai belum ada bukti, bukan sebagai lolos', () => {
    expect(
      resolveValidationStatus({
        validationDays: 400,
        effectiveSamples: 200,
        pValue: null,
        outOfSampleTested: false,
      })
    ).toBe('EXPLORATORY');
  });

  it('suppressUnvalidatedSignificance memaksa significant=false dan menghapus klaim unggul signifikan', () => {
    const suppressed = suppressUnvalidatedSignificance({
      significant: true,
      pValue: 0.0001,
      conclusion: 'Bucket 80-100 unggul signifikan atas bucket <60 pada alpha 5%.',
    });

    expect(suppressed.significant).toBe(false);
    expect(suppressed.pValue).toBe(0.0001); // angkanya TIDAK disembunyikan, klaimnya yang dicabut
    expect(suppressed.conclusion.toLowerCase()).not.toContain('unggul signifikan');
    expect(suppressed.conclusion.toLowerCase()).toContain('indikatif');
  });

  it('suppressUnvalidatedSignificance tidak mengarang klaim saat hasilnya memang tidak signifikan', () => {
    const suppressed = suppressUnvalidatedSignificance({
      significant: false,
      pValue: 0.6,
      conclusion: 'Belum terbukti signifikan pada alpha 5%.',
    });

    expect(suppressed.significant).toBe(false);
    expect(suppressed.conclusion.toLowerCase()).toContain('indikatif');
  });
});
