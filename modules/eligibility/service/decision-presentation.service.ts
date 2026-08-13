import type { ScoringKategori } from '../../technical/service/scoring.service';
import type { AdvisoryDecision } from './advisory.service';

export type DecisionPresentationKind =
  | 'ACTIONABLE'
  | 'MODEL_UNVALIDATED'
  | 'INELIGIBLE'
  | 'UNAVAILABLE';

export interface DecisionPresentation {
  kind: DecisionPresentationKind;
  /** Hasil LensScore apa adanya. Ini sinyal model, bukan otomatis rekomendasi. */
  modelSignal: ScoringKategori | null;
  /** Label aman untuk menampilkan hasil model sebagai informasi. */
  modelSignalLabel: string | null;
  /** Hanya terisi ketika recommendation benar-benar actionable. */
  recommendationLabel: string | null;
  /** Status terpisah dari arah sinyal agar alasan non-actionable tidak disalahbaca. */
  statusLabel: string | null;
  actionable: boolean;
  explanation: string | null;
}

// 'INFORMASI', bukan 'WATCH'. Dua sebab. Pertama, WATCH bertabrakan dengan nama fitur
// LensWatch - daftar favorit yang diisi pengguna sendiri - sehingga status model terbaca
// seolah perintah menambahkan emiten ke sana. Kedua, setiap padanan kata kerja (AMATI,
// PANTAU, TUNGGU) mengulang masalah yang sama: ia menyuruh pengguna melakukan sesuatu,
// padahal yang dimaksud sekadar menyatakan keadaan. INFORMASI sejajar bentuknya dengan
// BUY/SELL/HOLD (kata benda) dan sesuai dengan kalimat yang sudah dipakai aplikasi:
// LensScore adalah skor informasi, bukan rekomendasi.
export type SimpleDecisionLabel = 'INFORMASI' | 'DATA TERBATAS' | 'TIDAK LAYAK' | 'BUY' | 'SELL' | 'HOLD';

/**
 * Label satu-baris untuk kartu ringkas. Skor model yang belum tervalidasi sengaja
 * menjadi WATCH, bukan BUY/SELL. Arah transaksi hanya boleh berasal dari keputusan
 * advisory yang benar-benar actionable.
 */
export function getSimpleDecisionLabel(presentation: DecisionPresentation): SimpleDecisionLabel {
  if (presentation.modelSignal === 'DATA TIDAK CUKUP') return 'DATA TERBATAS';
  if (presentation.kind === 'INELIGIBLE') return 'TIDAK LAYAK';
  if (presentation.kind !== 'ACTIONABLE' || !presentation.recommendationLabel) return 'INFORMASI';

  const action = presentation.recommendationLabel.replace(/^REKOMENDASI:\s*/, '');
  return action === 'BUY' || action === 'SELL' || action === 'HOLD' ? action : 'INFORMASI';
}

function hasActionableModelSignal(kategori: ScoringKategori | null | undefined): kategori is Exclude<ScoringKategori, 'DATA TIDAK CUKUP'> {
  return kategori === 'STRONG BUY' || kategori === 'BUY' || kategori === 'HOLD' || kategori === 'SELL';
}

/**
 * Presentation-only bridge between LensScore output and advisory safety state.
 *
 * Penting: fungsi ini TIDAK mengubah scoring, threshold, eligibility, atau model-validation.
 * Ia hanya mencegah `advisory=false` dibaca seolah arah model = NETRAL atau seolah saham
 * pasti buruk. `decision.action` tetap satu-satunya sumber rekomendasi actionable.
 */
export function getDecisionPresentation(
  kategori: ScoringKategori | null | undefined,
  decision: AdvisoryDecision | null | undefined,
): DecisionPresentation {
  const modelSignal = kategori ?? null;
  const modelSignalLabel = modelSignal === 'DATA TIDAK CUKUP'
    ? 'STATUS MODEL: DATA TIDAK CUKUP'
    : modelSignal
      ? `SINYAL MODEL: ${modelSignal}`
      : null;

  if (decision?.advisory === true && decision.action) {
    return {
      kind: 'ACTIONABLE',
      modelSignal,
      modelSignalLabel,
      recommendationLabel: `REKOMENDASI: ${decision.action}`,
      statusLabel: null,
      actionable: true,
      explanation: null,
    };
  }

  if (decision?.reasonCodes?.includes('MODEL_UNVALIDATED')) {
    return {
      kind: 'MODEL_UNVALIDATED',
      modelSignal,
      modelSignalLabel: hasActionableModelSignal(modelSignal) ? `SINYAL MODEL: ${modelSignal}` : modelSignalLabel,
      recommendationLabel: null,
      statusLabel: 'MODEL BELUM TERVALIDASI',
      actionable: false,
      explanation: decision.explanation,
    };
  }

  if (decision?.advisory === false && decision.eligibilityStatus !== 'ELIGIBLE') {
    return {
      kind: 'INELIGIBLE',
      modelSignal,
      modelSignalLabel,
      recommendationLabel: null,
      statusLabel: 'TIDAK LAYAK DIREKOMENDASIKAN',
      actionable: false,
      explanation: decision.explanation,
    };
  }

  // `decision` hilang / score unavailable / DATA TIDAK CUKUP: fail-closed. Nilai model
  // tetap boleh terlihat, tetapi jangan dinaikkan menjadi rekomendasi hanya demi
  // kompatibilitas payload lama.
  return {
    kind: 'UNAVAILABLE',
    modelSignal,
    modelSignalLabel,
    recommendationLabel: null,
    statusLabel: 'REKOMENDASI TIDAK TERSEDIA',
    actionable: false,
    explanation: decision?.explanation ?? null,
  };
}
