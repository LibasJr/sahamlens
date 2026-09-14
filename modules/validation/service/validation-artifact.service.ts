import { createHash } from 'node:crypto';
import {
  computeParameterFingerprint,
  getActiveModelParameters,
  VALIDATION_ARTIFACT_SCHEMA_VERSION,
} from '@/shared/constants/model-fingerprint';

/**
 * Artefak validasi model LensScore yang dapat diaudit.
 *
 * ===================================================================================
 * ATURAN TUNGGAL
 * ===================================================================================
 * `validated=true` HANYA sah kalau `parameterFingerprint` di artefak identik dengan
 * sidik jari parameter yang benar-benar berjalan di proses ini.
 *
 * Konsekuensinya otomatis, tanpa perlu diingat siapa pun:
 *   - formula berubah    -> fingerprint berubah -> MODEL_UNVALIDATED
 *   - bobot berubah      -> fingerprint berubah -> MODEL_UNVALIDATED
 *   - threshold berubah  -> fingerprint berubah -> MODEL_UNVALIDATED
 *   - coverage berubah   -> fingerprint berubah -> MODEL_UNVALIDATED
 *
 * Tidak ada boolean yang bisa diketik manual untuk melewati ini.
 *
 * ===================================================================================
 * KENAPA METRIK IKUT DIPERIKSA, BUKAN SEKADAR DISIMPAN
 * ===================================================================================
 * Artefak yang hanya menyimpan angka tanpa memeriksanya mengubah masalah, bukan
 * menyelesaikannya: alih-alih boolean manual, kita punya angka manual.
 *
 * Karena itu artefak ditolak kalau bukti di dalamnya tidak memenuhi syarat minimum:
 * Brier Skill Score harus positif (model harus mengalahkan base rate - kalau tidak,
 * ia tidak punya nilai prediktif sama sekali), sampel harus memadai, dan jendela OOS
 * harus utuh.
 *
 * Ini menutup jalur "isi saja angkanya asal ada" tanpa menyentuh satu pun ambang
 * model - artefak yang gagal syarat ditolak, bukan model yang dilonggarkan.
 */

export interface ValidationArtifact {
  schemaVersion: string;
  modelVersion: string;
  scoreVersion: string;
  parameterFingerprint: string;

  /** Batas akhir data yang boleh dipakai membangun/menyetel model. */
  trainingCutoff: string;
  /** Jendela out-of-sample: seluruhnya HARUS setelah trainingCutoff. */
  oosStart: string;
  oosEnd: string;

  sampleCount: number;
  eligibleSampleCount: number;

  brierScore: number;
  brierSkillScore: number;
  /** Expected Calibration Error. */
  ece: number;
  wilsonCiLower: number;
  wilsonCiUpper: number;
  baseRate: number;

  approvedAt: string;
  approvedBy: string;
  /** Hash isi artefak - mendeteksi artefak yang disunting setelah disetujui. */
  artifactHash: string;
  validated: boolean;
}

export type ValidationRejectionCode =
  | 'NO_ARTIFACT'
  | 'ARTIFACT_TAMPERED'
  | 'FINGERPRINT_MISMATCH'
  | 'ARTIFACT_NOT_APPROVED'
  | 'INSUFFICIENT_SAMPLE'
  | 'NO_PREDICTIVE_SKILL'
  | 'INVALID_OOS_WINDOW';

/** Sampel minimum sebelum angka apa pun layak disebut bukti. */
export const MIN_VALIDATION_SAMPLES = 200;

/** Hash isi artefak, dengan field `artifactHash` sendiri dikecualikan. */
export function computeArtifactHash(artifact: Omit<ValidationArtifact, 'artifactHash'>): string {
  const entries = Object.entries(artifact)
    .filter(([k]) => k !== 'artifactHash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonical = JSON.stringify(entries);
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

export interface ValidationVerdict {
  validated: boolean;
  reasonCode: 'VALIDATED' | ValidationRejectionCode;
  message: string;
  /** Sidik jari yang benar-benar aktif - selalu diisi, untuk audit. */
  activeFingerprint: string;
  artifactFingerprint: string | null;
}

/**
 * Memverifikasi artefak terhadap parameter yang aktif SEKARANG.
 *
 * Urutan pemeriksaan disengaja: keutuhan artefak lebih dulu (artefak yang sudah
 * disunting tidak layak dipercaya untuk pemeriksaan apa pun sesudahnya), baru
 * kecocokan parameter, baru mutu bukti.
 */
export function verifyValidationArtifact(
  artifact: ValidationArtifact | null,
  activeFingerprint: string = computeParameterFingerprint(),
): ValidationVerdict {
  const base = { activeFingerprint, artifactFingerprint: artifact?.parameterFingerprint ?? null };

  if (!artifact) {
    return {
      ...base,
      validated: false,
      reasonCode: 'NO_ARTIFACT',
      message:
        'Belum ada artefak validasi. LensScore tetap boleh tampil sebagai ringkasan indikator, ' +
        'tetapi tidak boleh disajikan sebagai model yang terbukti meramal hasil.',
    };
  }

  const expectedHash = computeArtifactHash(artifact);
  if (expectedHash !== artifact.artifactHash) {
    return {
      ...base,
      validated: false,
      reasonCode: 'ARTIFACT_TAMPERED',
      message:
        'Isi artefak validasi tidak cocok dengan hash-nya sendiri - artefak disunting ' +
        'setelah disetujui. Status validasi ditolak.',
    };
  }

  if (artifact.parameterFingerprint !== activeFingerprint) {
    return {
      ...base,
      validated: false,
      reasonCode: 'FINGERPRINT_MISMATCH',
      message:
        `Parameter model yang berjalan (${activeFingerprint}) berbeda dari yang divalidasi ` +
        `(${artifact.parameterFingerprint}). Formula, bobot, atau ambang telah berubah sejak ` +
        'validasi - hasil validasi lama tidak berlaku untuk model yang sekarang.',
    };
  }

  if (!artifact.validated) {
    return {
      ...base,
      validated: false,
      reasonCode: 'ARTIFACT_NOT_APPROVED',
      message: 'Artefak validasi ada dan cocok, tetapi belum ditandai disetujui.',
    };
  }

  // Jendela OOS harus seluruhnya SETELAH batas latih. Kalau tumpang tindih, model
  // diuji pada data yang ikut membentuknya - itu bukan out-of-sample.
  if (!(artifact.oosStart > artifact.trainingCutoff) || !(artifact.oosEnd >= artifact.oosStart)) {
    return {
      ...base,
      validated: false,
      reasonCode: 'INVALID_OOS_WINDOW',
      message:
        `Jendela OOS tidak sah (cutoff ${artifact.trainingCutoff}, ` +
        `OOS ${artifact.oosStart} s/d ${artifact.oosEnd}). Data uji harus seluruhnya ` +
        'setelah batas latih.',
    };
  }

  if (artifact.eligibleSampleCount < MIN_VALIDATION_SAMPLES) {
    return {
      ...base,
      validated: false,
      reasonCode: 'INSUFFICIENT_SAMPLE',
      message:
        `Sampel layak ${artifact.eligibleSampleCount} di bawah minimum ` +
        `${MIN_VALIDATION_SAMPLES}. Angka dari sampel kecil bukan bukti.`,
    };
  }

  // Brier Skill Score <= 0 berarti model tidak lebih baik daripada menebak base rate.
  if (!(artifact.brierSkillScore > 0)) {
    return {
      ...base,
      validated: false,
      reasonCode: 'NO_PREDICTIVE_SKILL',
      message:
        `Brier Skill Score ${artifact.brierSkillScore} tidak positif - model tidak ` +
        'mengalahkan base rate pada data out-of-sample.',
    };
  }

  return {
    ...base,
    validated: true,
    reasonCode: 'VALIDATED',
    message:
      `Model ${artifact.modelVersion} tervalidasi pada OOS ${artifact.oosStart} s/d ` +
      `${artifact.oosEnd} (${artifact.eligibleSampleCount} sampel layak, ` +
      `BSS ${artifact.brierSkillScore}).`,
  };
}

/** Sidik jari parameter aktif - dipakai saat menyusun artefak baru. */
export function activeParameterFingerprint(): string {
  return computeParameterFingerprint(getActiveModelParameters());
}

export { VALIDATION_ARTIFACT_SCHEMA_VERSION };
