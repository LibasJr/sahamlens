import type { ScoringKategori } from '../../technical/service/scoring.service';
import type { AdvisoryDecision } from './advisory.service';
import { getKategoriPresentationLabel, getKategoriTone } from '@/shared/presentation/signal-labels';
import { describeUserRecommendationStatus, describeUserSignalLabel } from '@/shared/presentation/user-status-labels';

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
//
// Nilai actionable TIDAK lagi 'BUY'/'SELL'/'HOLD' mentah (audit label rekomendasi
// 2026-08-15) - kata transaksi Inggris di kartu ringkas terbaca sebagai ajakan beli/jual
// terlepas dari apakah statusnya benar-benar actionable. 'SINYAL POSITIF'/'SINYAL
// NEGATIF'/'NETRAL / PANTAU' menyatakan arah tanpa kata kerja transaksi, konsisten
// dengan getKategoriPresentationLabel().
export type SimpleDecisionLabel =
  | 'INFORMASI'
  | 'DATA TERBATAS'
  | 'TIDAK LAYAK'
  | 'SINYAL POSITIF'
  | 'SINYAL NEGATIF'
  | 'NETRAL / PANTAU';

/**
 * Label satu-baris untuk kartu ringkas. Skor model yang belum tervalidasi sengaja
 * menjadi INFORMASI, bukan sinyal arah. Arah transaksi hanya boleh berasal dari keputusan
 * advisory yang benar-benar actionable, dan bahkan saat actionable labelnya tetap kata
 * sifat arah (SINYAL POSITIF/NEGATIF), bukan kata kerja transaksi.
 */
export function getSimpleDecisionLabel(presentation: DecisionPresentation): SimpleDecisionLabel {
  if (presentation.modelSignal === 'DATA TIDAK CUKUP') return 'DATA TERBATAS';
  if (presentation.kind === 'INELIGIBLE') return 'TIDAK LAYAK';
  if (presentation.kind !== 'ACTIONABLE' || !presentation.modelSignal) return 'INFORMASI';

  const tone = getKategoriTone(presentation.modelSignal);
  if (tone === 'positive') return 'SINYAL POSITIF';
  if (tone === 'negative') return 'SINYAL NEGATIF';
  return 'NETRAL / PANTAU';
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
  const modelSignalLabel = modelSignal ? describeUserSignalLabel(modelSignal) : null;

  if (decision?.advisory === true && decision.action) {
    return {
      kind: 'ACTIONABLE',
      modelSignal,
      modelSignalLabel,
      recommendationLabel: `REKOMENDASI: ${getKategoriPresentationLabel(decision.action)}`,
      statusLabel: null,
      actionable: true,
      explanation: null,
    };
  }

  if (decision?.reasonCodes?.includes('MODEL_UNVALIDATED')) {
    return {
      kind: 'MODEL_UNVALIDATED',
      modelSignal,
      modelSignalLabel: hasActionableModelSignal(modelSignal) ? describeUserSignalLabel(modelSignal) : modelSignalLabel,
      recommendationLabel: null,
      statusLabel: describeUserRecommendationStatus(decision.reasonCodes, decision.eligibilityStatus),
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
      statusLabel: describeUserRecommendationStatus(decision.reasonCodes, decision.eligibilityStatus),
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
    statusLabel: describeUserRecommendationStatus(decision?.reasonCodes, decision?.eligibilityStatus),
    actionable: false,
    explanation: decision?.explanation ?? null,
  };
}
