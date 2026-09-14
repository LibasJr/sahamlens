import {
  verifyValidationArtifact,
  activeParameterFingerprint,
  type ValidationArtifact,
  type ValidationVerdict,
} from './validation-artifact.service';
import artifactFile from '@/data/validation/lens-score-validation.json';

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
 *
 * ===================================================================================
 * KENAPA JSON DI-IMPORT STATIS, BUKAN DIBACA DENGAN node:fs
 * ===================================================================================
 * Versi pertama berkas ini membaca artefak dengan `fs.readFileSync`. Itu LULUS
 * typecheck, lint, 3.170 test, dan build Linux - lalu menggagalkan `build-windows`:
 *
 *     UnhandledSchemeError: Reading from "node:fs" is not handled by plugins
 *     Import trace: lens-score-validation.service.ts -> modules/validation/index.ts
 *                   -> advisory.service.ts -> app/dashboard/page.tsx
 *
 * Berkas ini ikut tertarik ke bundel klien lewat dashboard, dan build Tauri adalah
 * static export - tidak ada `fs` di sana.
 *
 * Import JSON statis menyelesaikannya tanpa mengorbankan apa pun yang penting:
 * artefak tetap berkas terpisah yang bisa ditinjau, di-diff, dan diarsipkan. Yang
 * hilang hanya kemampuan mengganti artefak tanpa build ulang - dan itu justru
 * BAIK: mengubah status validasi model memang seharusnya lewat commit yang terlihat,
 * bukan menaruh berkas di disk produksi.
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
 * Artefak dari berkas JSON. `null` berarti belum ada validasi.
 *
 * JSON yang rusak akan menggagalkan build - itu disengaja. Artefak yang tidak bisa
 * dibaca tidak boleh diam-diam menjadi "lolos", dan gagal saat build jauh lebih baik
 * daripada gagal diam-diam saat melayani pengguna.
 */
function loadArtifact(): ValidationArtifact | null {
  const raw = (artifactFile as { artifact: unknown }).artifact;
  return raw ? (raw as ValidationArtifact) : null;
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
