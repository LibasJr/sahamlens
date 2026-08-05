import type { ScoringKategori } from '../../technical/service/scoring.service';
import type { EligibilityResult } from '../types/eligibility.types';
import { getLensScoreValidationStatus } from '@/modules/validation';

// Jembatan antara kategori LensScore v1 dan lapisan kelayakan (Phase 0 / P0-3).
//
// v1 mengeluarkan `kategori` bertipe 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' |
// 'DATA TIDAK CUKUP' dan halaman-halaman lama membacanya langsung. Field itu SENGAJA
// tidak diubah (backward compatibility - lihat blueprint §22). Yang ditambahkan adalah
// objek `decision` di sebelahnya yang MENJADI sumber kebenaran untuk "boleh ditindak
// atau tidak".

/** Aksi yang boleh ditindak. `null` = tidak dinilai - BUKAN 'HOLD'. */
export type AdvisoryAction = 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | null;

export interface AdvisoryDecision {
  /** null kalau saham tidak layak diberi rekomendasi. TIDAK PERNAH di-default ke HOLD. */
  action: AdvisoryAction;
  /** false = angka boleh ditampilkan, rekomendasi TIDAK boleh ditampilkan. */
  advisory: boolean;
  eligibilityStatus: EligibilityResult['status'];
  reasonCodes: string[];
  /** Kalimat siap tampil kalau advisory === false. */
  explanation: string | null;
}

const ACTIONABLE: ReadonlySet<string> = new Set(['STRONG BUY', 'BUY', 'HOLD', 'SELL']);

/**
 * Turunkan keputusan yang boleh ditindak dari kategori v1 + hasil gerbang kelayakan.
 *
 * INVARIAN: `action !== null` mensyaratkan `eligibility.status === 'ELIGIBLE'`.
 * Diuji di modules/eligibility/__tests__/advisory.service.test.ts.
 */
export function toAdvisoryDecision(
  kategori: ScoringKategori | null | undefined,
  eligibility: EligibilityResult
): AdvisoryDecision {
  if (eligibility.status !== 'ELIGIBLE') {
    return {
      action: null,
      advisory: false,
      eligibilityStatus: eligibility.status,
      reasonCodes: eligibility.reasonCodes,
      explanation: eligibility.message,
    };
  }

  // 'DATA TIDAK CUKUP' bukan rekomendasi - ia pernyataan tentang datanya. Diteruskan
  // sebagai action null, bukan dipetakan ke HOLD.
  if (!kategori || !ACTIONABLE.has(kategori)) {
    return {
      action: null,
      advisory: false,
      eligibilityStatus: eligibility.status,
      reasonCodes: kategori === 'DATA TIDAK CUKUP' ? ['COVERAGE_BELOW_MIN'] : ['SCORE_UNAVAILABLE'],
      explanation:
        kategori === 'DATA TIDAK CUKUP'
          ? 'Kelengkapan data di bawah ambang - skor tidak disajikan sebagai rekomendasi.'
          : 'Skor tidak tersedia untuk saham ini.',
    };
  }

  // Kelayakan data bukan bukti bahwa MODEL-nya sudah akurat. Tanpa pemisahan ini,
  // skor yang belum pernah diuji dapat berubah menjadi ajakan transaksi hanya karena
  // OHLCV/fundamentalnya lengkap. Tetap fail-closed sampai artefak backtest point-in-
  // time yang dapat diaudit tersedia.
  const validation = getLensScoreValidationStatus();
  if (!validation.validated) {
    return {
      action: null,
      advisory: false,
      eligibilityStatus: 'ELIGIBLE',
      reasonCodes: [validation.reasonCode],
      explanation: validation.message,
    };
  }

  return {
    action: kategori as AdvisoryAction,
    advisory: true,
    eligibilityStatus: 'ELIGIBLE',
    reasonCodes: [],
    explanation: null,
  };
}
