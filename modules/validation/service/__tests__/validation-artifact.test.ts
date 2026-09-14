import { describe, expect, it } from 'vitest';
import {
  verifyValidationArtifact,
  computeArtifactHash,
  MIN_VALIDATION_SAMPLES,
  type ValidationArtifact,
} from '../validation-artifact.service';
import {
  computeParameterFingerprint,
  getActiveModelParameters,
  canonicalParameterString,
  type ModelParameters,
} from '@/shared/constants/model-fingerprint';

const ACTIVE = computeParameterFingerprint();

/** Artefak sah: sidik jari cocok, bukti memadai, hash benar. */
function goodArtifact(overrides: Partial<ValidationArtifact> = {}): ValidationArtifact {
  const draft: Omit<ValidationArtifact, 'artifactHash'> = {
    schemaVersion: 'validation-artifact-v1',
    modelVersion: 'lens-score-1.0.0',
    scoreVersion: 'lens-score-formula-v1.0',
    parameterFingerprint: ACTIVE,
    trainingCutoff: '2025-12-31',
    oosStart: '2026-01-01',
    oosEnd: '2026-06-30',
    sampleCount: 1200,
    eligibleSampleCount: 950,
    brierScore: 0.21,
    brierSkillScore: 0.08,
    ece: 0.04,
    wilsonCiLower: 0.51,
    wilsonCiUpper: 0.59,
    baseRate: 0.48,
    approvedAt: '2026-07-01T00:00:00.000Z',
    approvedBy: 'libas',
    validated: true,
    ...overrides,
  };
  return { ...draft, artifactHash: computeArtifactHash(draft) };
}

describe('003 - tidak ada model yang bisa disebut validated tanpa artefak', () => {
  it('tanpa artefak -> MODEL_UNVALIDATED', () => {
    const v = verifyValidationArtifact(null, ACTIVE);
    expect(v.validated).toBe(false);
    expect(v.reasonCode).toBe('NO_ARTIFACT');
  });

  it('artefak sah dan cocok -> VALIDATED', () => {
    const v = verifyValidationArtifact(goodArtifact(), ACTIVE);
    expect(v.validated).toBe(true);
    expect(v.reasonCode).toBe('VALIDATED');
  });

  it('validated=true yang diketik manual TIDAK cukup kalau hash tidak cocok', () => {
    // Inti butir 003: mengubah boolean saja tidak boleh menghasilkan status valid.
    const tampered = { ...goodArtifact(), validated: true, eligibleSampleCount: 999_999 };
    const v = verifyValidationArtifact(tampered, ACTIVE);
    expect(v.validated).toBe(false);
    expect(v.reasonCode).toBe('ARTIFACT_TAMPERED');
  });
});

describe('003 - perubahan parameter otomatis membatalkan validasi', () => {
  const base = getActiveModelParameters();

  function withFingerprintOf(mutate: (p: ModelParameters) => ModelParameters) {
    const changed = computeParameterFingerprint(mutate(structuredClone(base)));
    return verifyValidationArtifact(goodArtifact(), changed);
  }

  it('BOBOT berubah -> MODEL_UNVALIDATED', () => {
    const v = withFingerprintOf((p) => {
      p.weights.technical = 50;
      p.weights.fundamental = 25;
      p.weights.flow = 25;
      return p;
    });
    expect(v.validated).toBe(false);
    expect(v.reasonCode).toBe('FINGERPRINT_MISMATCH');
  });

  it('THRESHOLD berubah -> MODEL_UNVALIDATED', () => {
    const v = withFingerprintOf((p) => {
      p.thresholds.buyCandidateScore = 65;
      return p;
    });
    expect(v.validated).toBe(false);
    expect(v.reasonCode).toBe('FINGERPRINT_MISMATCH');
  });

  it('FORMULA berubah -> MODEL_UNVALIDATED', () => {
    const v = withFingerprintOf((p) => {
      p.formulaVersion = 'lens-score-formula-v2.0';
      return p;
    });
    expect(v.validated).toBe(false);
    expect(v.reasonCode).toBe('FINGERPRINT_MISMATCH');
  });

  it('AMBANG COVERAGE berubah -> MODEL_UNVALIDATED', () => {
    const v = withFingerprintOf((p) => {
      p.minCoveragePct = 45;
      return p;
    });
    expect(v.validated).toBe(false);
    expect(v.reasonCode).toBe('FINGERPRINT_MISMATCH');
  });

  it('pergeseran satu angka kecil pun terdeteksi', () => {
    const v = withFingerprintOf((p) => {
      p.thresholds.maxExecutableAgeMinutes = 31;
      return p;
    });
    expect(v.validated).toBe(false);
  });
});

describe('003 - sidik jari harus stabil dan deterministik', () => {
  it('dua panggilan berturut menghasilkan sidik jari sama', () => {
    expect(computeParameterFingerprint()).toBe(computeParameterFingerprint());
  });

  it('urutan penulisan kunci TIDAK mengubah sidik jari', () => {
    // Sidik jari yang berubah karena baris ditukar adalah sidik jari yang akan
    // memerah pada refactor tak berbahaya, lalu dimatikan orang.
    const p = getActiveModelParameters();
    const reordered = {
      thresholds: { ...p.thresholds },
      minCoveragePct: p.minCoveragePct,
      totalWeight: p.totalWeight,
      weights: { flow: p.weights.flow, technical: p.weights.technical, fundamental: p.weights.fundamental },
      formulaVersion: p.formulaVersion,
    } as ModelParameters;
    expect(computeParameterFingerprint(reordered)).toBe(computeParameterFingerprint(p));
  });

  it('bentuk kanonik memuat seluruh parameter berpengaruh', () => {
    const canonical = canonicalParameterString(getActiveModelParameters());
    for (const key of ['formulaVersion', 'weights', 'thresholds', 'minCoveragePct', 'totalWeight']) {
      expect(canonical).toContain(key);
    }
  });
});

describe('003 - mutu bukti ikut diperiksa, bukan sekadar disimpan', () => {
  it('sampel di bawah minimum ditolak', () => {
    const v = verifyValidationArtifact(
      goodArtifact({ eligibleSampleCount: MIN_VALIDATION_SAMPLES - 1 }),
      ACTIVE,
    );
    expect(v.validated).toBe(false);
    expect(v.reasonCode).toBe('INSUFFICIENT_SAMPLE');
  });

  it('Brier Skill Score tidak positif ditolak - model tidak mengalahkan base rate', () => {
    for (const bss of [0, -0.05]) {
      const v = verifyValidationArtifact(goodArtifact({ brierSkillScore: bss }), ACTIVE);
      expect(v.validated).toBe(false);
      expect(v.reasonCode).toBe('NO_PREDICTIVE_SKILL');
    }
  });

  it('jendela OOS yang tumpang tindih dengan data latih ditolak', () => {
    const v = verifyValidationArtifact(
      goodArtifact({ trainingCutoff: '2026-03-01', oosStart: '2026-01-01' }),
      ACTIVE,
    );
    expect(v.validated).toBe(false);
    expect(v.reasonCode).toBe('INVALID_OOS_WINDOW');
  });

  it('artefak yang belum disetujui ditolak walau semuanya cocok', () => {
    const v = verifyValidationArtifact(goodArtifact({ validated: false }), ACTIVE);
    expect(v.validated).toBe(false);
    expect(v.reasonCode).toBe('ARTIFACT_NOT_APPROVED');
  });
});
