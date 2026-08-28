import { getKategoriPresentationLabel } from './signal-labels';

/**
 * Vocabulary khusus layar pengguna.
 *
 * File ini hanya menerjemahkan status internal menjadi teks yang lebih mudah dibaca.
 * Tidak ada perubahan scoring, eligibility, validasi, atau data pasar di sini.
 */

export function describeUserConfidenceLabel(value: string | null | undefined): string {
  switch (value) {
    case 'HIGH':
      return 'Keyakinan tinggi';
    case 'MEDIUM':
      return 'Keyakinan sedang';
    case 'LOW':
      return 'Keyakinan rendah';
    default:
      return value ? `Keyakinan ${value.replaceAll('_', ' ').toLowerCase()}` : 'Keyakinan belum tersedia';
  }
}

export function describeUserResearchLabel(value: string | null | undefined): string {
  switch (value) {
    case 'RESEARCH_ONLY':
      return 'Untuk riset saja';
    case 'MODEL_UNVALIDATED':
      return 'Masih tahap uji';
    case 'NON_ACTIONABLE':
      return 'Belum jadi rekomendasi';
    case 'VALIDATED_OUT_OF_SAMPLE':
      return 'Validasi riset tersedia';
    default:
      return value ? value.replaceAll('_', ' ').toLowerCase() : 'Status riset belum tersedia';
  }
}

export function describeUserSignalLabel(signal: string | null | undefined): string {
  if (!signal) return 'Sinyal belum tersedia';
  if (signal === 'DATA TIDAK CUKUP') return 'Data belum cukup';
  return `Sinyal riset: ${getKategoriPresentationLabel(signal)}`;
}

export function describeUserRecommendationStatus(
  reasonCodes: readonly string[] | null | undefined,
  eligibilityStatus: string | null | undefined,
): string {
  if (reasonCodes?.includes('MODEL_UNVALIDATED')) return 'Masih tahap uji';
  if (reasonCodes?.includes('COVERAGE_BELOW_MIN')) return 'Data belum cukup';
  if (eligibilityStatus && eligibilityStatus !== 'ELIGIBLE') return 'Belum layak direkomendasikan';
  return 'Rekomendasi belum tersedia';
}

export function describeUserEligibilityFallback(
  eligibilityStatus: string | null | undefined,
): string {
  if (eligibilityStatus && eligibilityStatus !== 'ELIGIBLE') return 'Belum layak direkomendasikan';
  return 'Data belum cukup';
}

export function describeUserAdvisoryStatus(advisoryEnabled: boolean): { label: string; title: string } {
  return advisoryEnabled
    ? {
        label: 'Rencana aktif',
        title: 'Model dan gerbang kelayakan mengizinkan rencana yang bisa ditindaklanjuti.',
      }
    : {
        label: 'Untuk riset saja',
        title: 'Sinyal tetap ditampilkan sebagai bahan riset, bukan rekomendasi transaksi.',
      };
}

export function describeUserIntegrityStatus(status: string | null | undefined): { label: string; detail: string; caution: boolean } {
  switch (status) {
    case 'MATCH':
      return {
        label: 'Harga sudah cocok',
        detail: 'Harga penutupan cocok dengan sumber pembanding independen.',
        caution: false,
      };
    case 'MISMATCH':
      return {
        label: 'Data harga sedang diperiksa',
        detail: 'Harga penutupan berbeda antar sumber. SahamLens tidak menganggap salah satu angka pasti benar.',
        caution: true,
      };
    case 'PRIMARY_ONLY':
    case 'SECONDARY_ONLY':
    case 'NO_DATA':
      return {
        label: 'Verifikasi belum lengkap',
        detail: 'Salah satu atau kedua sumber belum menyediakan pasangan harga yang bisa diverifikasi.',
        caution: true,
      };
    case 'FAILED':
      return {
        label: 'Verifikasi gagal dijalankan',
        detail: 'Proses pengecekan harga gagal. Data belum dihitung sebagai cocok.',
        caution: true,
      };
    default:
      return {
        label: 'Status verifikasi belum diketahui',
        detail: 'SahamLens belum menerima status pengecekan harga yang lengkap.',
        caution: true,
      };
  }
}
