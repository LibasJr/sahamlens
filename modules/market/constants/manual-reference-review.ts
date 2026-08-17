/**
 * Metadata freshness untuk daftar pasar yang dipelihara manual.
 *
 * Daftar manual TIDAK boleh diam-diam berubah menjadi klaim identitas indeks (LQ45,
 * IDX30, blue-chip, dst). reviewBy sengaja diperiksa CI agar data referensi manual
 * tidak membusuk tanpa ada pengingat yang bisa diabaikan.
 */
export interface ManualMarketReferenceReview {
  id: string;
  reviewedAt: string;
  reviewBy: string;
  purpose: string;
  identityClaim: boolean;
}

export const MANUAL_MARKET_REFERENCE_REVIEWS = [
  {
    id: 'SCREENER_UNIVERSE',
    reviewedAt: '2026-08-17',
    reviewBy: '2026-11-30',
    purpose: 'Curated scanner universe; bukan daftar konstituen LQ45/IDX30.',
    identityClaim: false,
  },
  {
    id: 'AI_PICK_UNIVERSE',
    reviewedAt: '2026-08-17',
    reviewBy: '2026-11-30',
    purpose: 'Universe kandidat scanner aktif; bukan identitas indeks/blue-chip.',
    identityClaim: false,
  },
  {
    id: 'TRENDING_SYMBOLS',
    reviewedAt: '2026-08-17',
    reviewBy: '2026-11-30',
    purpose: 'Kamus simbol populer untuk UX; bukan daftar trending/LQ45/blue-chip.',
    identityClaim: false,
  },
] as const satisfies readonly ManualMarketReferenceReview[];
