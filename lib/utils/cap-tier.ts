// BARU (2026-08-14, brainstorm lanjutan review eksternal - opsi A yang dipilih
// pengguna: "badge Blue-chip/Small-cap, BUKAN ubah parameter teknikal/MA"). Ambang di
// bawah [HYPOTHESIS] - belum divalidasi backtest, MURNI label informasional supaya
// pengguna tahu konteks likuiditas saham yang sedang dianalisis. TIDAK mengubah cara
// skor/konsensus dihitung sama sekali - itu keputusan eksplisit untuk menghindari
// mengganti parameter teknikal tanpa bukti backtest bahwa parameter barunya lebih baik.
//
// Dipindah keluar dari app/dashboard/page.tsx (2026-08-14) - Next.js App Router hanya
// mengizinkan export nama tertentu (default, metadata, dst.) dari file page.tsx;
// export function biasa membuat `next build` gagal type-check route module.
export const BLUE_CHIP_MIN_MARKET_CAP_IDR = 10_000_000_000_000; // Rp 10 triliun
export const BLUE_CHIP_MIN_ADV20_IDR = 5_000_000_000; // Rp 5 miliar/hari

export type CapTier = 'BLUE_CHIP' | 'SMALL_CAP' | null;

export function classifyCapTier(marketCap: number | null | undefined, adv20Idr: number | null | undefined): CapTier {
  if (typeof marketCap !== 'number' || typeof adv20Idr !== 'number') return null; // data tidak cukup - jangan menebak
  return marketCap >= BLUE_CHIP_MIN_MARKET_CAP_IDR && adv20Idr >= BLUE_CHIP_MIN_ADV20_IDR ? 'BLUE_CHIP' : 'SMALL_CAP';
}
