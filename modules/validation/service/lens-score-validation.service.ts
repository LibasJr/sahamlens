import fs from 'node:fs';
import path from 'node:path';
import {
  verifyValidationArtifact,
  activeParameterFingerprint,
  type ValidationArtifact,
  type ValidationVerdict,
} from './validation-artifact.service';

/**
 * Status validasi model LensScore.
 *
 * Skor dapat tetap ditampilkan sebagai ringkasan indikator yang dihitung dari data
 * pasar nyata, tetapi tidak boleh berubah menjadi ajakan BUY/HOLD/SELL sebelum
 * dibuktikan pada data point-in-time melalui backtest yang sudah ditetapkan sebelumnya.
 *
 * ===================================================================================
 * PERUBAHAN V2 BUTIR 003
 * ===================================================================================
 * Sebelumnya status ini adalah konstanta:
 *
 *     const STATUS = { validated: false, reasonCode: 'MODEL_UNVALIDATED', ... };
 *
 * Aman selama nilainya `false` - tetapi tidak terikat pada apa pun. Mengubahnya
 * menjadi `true` cukup satu penyuntingan, dan setelah itu status tetap berbunyi
 * "validated" walau bobot, ambang, atau formula berubah total.
 *
 * Sekarang status dihitung dari ARTEFAK yang sidik jarinya harus cocok dengan
 * parameter yang benar-benar berjalan. Menuliskan `validated: true` di artefak tidak
 * cukup: hash isinya diperiksa, sidik jari parameternya diperiksa, dan mutu buktinya
 * diperiksa.
 */
export interface LensScoreValidationStatus {
  validated: boolean;
  reasonCode: 'MODEL_UNVALIDATED' | 'VALIDATED';
  message: string;
  /** Sidik jari parameter yang berjalan - selalu ada, untuk audit dan UI. */
  parameterFingerprint: string;
  /** Sebab spesifik penolakan. `null` kalau tervalidasi. */
  rejectionCode: ValidationVerdict['reasonCode'] | null;
}

/**
 * Lokasi artefak. Berkas, bukan variabel lingkungan atau baris kode.
 *
 * Artefak harus bisa ditinjau, di-diff, dan diarsipkan - tiga hal yang tidak bisa
 * dilakukan pada boolean di dalam kode.
 */
const ARTIFACT_PATH = path.join(process.cwd(), 'data', 'validation', 'lens-score-validation.json');

let cached: { artifact: ValidationArtifact | null; mtimeMs: number } | null = null;

function loadArtifact(): ValidationArtifact | null {
  try {
    const stat = fs.statSync(ARTIFACT_PATH);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.artifact;
    const parsed = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8')) as ValidationArtifact;
    cached = { artifact: parsed, mtimeMs: stat.mtimeMs };
    return parsed;
  } catch {
    // Tidak ada artefak, tidak terbaca, atau JSON rusak - semuanya berarti
    // BELUM TERVALIDASI. Kegagalan membaca tidak boleh diam-diam menjadi lolos.
    cached = null;
    return null;
  }
}

export function getLensScoreValidationStatus(): LensScoreValidationStatus {
  const fingerprint = activeParameterFingerprint();
  const verdict = verifyValidationArtifact(loadArtifact(), fingerprint);

  if (verdict.validated) {
    return {
      validated: true,
      reasonCode: 'VALIDATED',
      message: verdict.message,
      parameterFingerprint: fingerprint,
      rejectionCode: null,
    };
  }

  return {
    validated: false,
    reasonCode: 'MODEL_UNVALIDATED',
    message:
      `${verdict.message} LensScore tetap boleh dipakai sebagai dasar derivasi arah riset ` +
      '(CENDERUNG BELI/JUAL/TAHAN) yang berasal dari data nyata terverifikasi, dengan ' +
      'penjelasan alasan, transparansi status validasi, dan penutup DYOR.',
    parameterFingerprint: fingerprint,
    rejectionCode: verdict.reasonCode,
  };
}

export function isLensScoreValidated(): boolean {
  return getLensScoreValidationStatus().validated;
}

/** Untuk test: membuang cache artefak. */
export function __resetValidationCache(): void {
  cached = null;
}
