// BARU (2026-08-14, brainstorm lanjutan review eksternal - opsi A yang dipilih
// pengguna: "badge Blue-chip/Small-cap, BUKAN ubah parameter teknikal/MA"). Badge
// INFORMASIONAL - TIDAK mengubah cara skor/konsensus dihitung sama sekali, itu
// keputusan eksplisit untuk menghindari mengganti parameter teknikal tanpa bukti
// backtest bahwa parameter barunya lebih baik.
//
// REVISI (2026-08-16, bug report pengguna: PACK.JK - saham kecil naik +8%/hari dengan
// data BASI - berlabel "Blue-chip"). Definisi lama murni market cap + ADV20 REAL-TIME
// (>= Rp 10T & >= Rp 5M/hari) - dua angka yang paling gampang digelembungkan sesaat
// oleh pump/gorengan, jadi badge yang seharusnya menandakan "aman/stabil" malah paling
// rawan salah nempel justru saat sedang terjadi gorengan. Sekarang BLUE_CHIP berarti
// "konstituen indeks LQ45 IDX saat ini" (lib/utils/blue-chip-index.ts) - keanggotaan
// indeks tidak bisa berubah karena pergerakan harga/volume satu-dua minggu, cuma lewat
// evaluasi resmi IDX 2x setahun. Lihat blue-chip-index.ts untuk catatan verifikasi
// manual daftarnya.
import { isBlueChipConstituent } from './blue-chip-index';

export type CapTier = 'BLUE_CHIP' | 'SMALL_CAP' | null;

export function classifyCapTier(
  ticker: string | null | undefined,
  marketCap: number | null | undefined,
  adv20Idr: number | null | undefined
): CapTier {
  // Data belum cukup (mis. IHSG, yang bukan saham individual) - diam lebih baik
  // daripada menebak.
  if (typeof marketCap !== 'number' || typeof adv20Idr !== 'number') return null;
  return isBlueChipConstituent(ticker) ? 'BLUE_CHIP' : 'SMALL_CAP';
}
