// REWRITE (audit skor fundamental 2026-08-05, dipicu laporan user - KOTA.JK dilabeli
// "UNDERVALUED (BULLISH 78%)" di /fundamental padahal Intrinsic Value (DCF/Graham/PER
// Fair) bilang overvalued 253% (margin of safety -253%).
//
// AKAR MASALAH: app/api/fundamental/[ticker]/route.ts SEBELUMNYA menghitung "UNDERVALUED/
// OVERVALUED" dari VOTE 13 analyzer digabung rata (PE, PBV, ROE, ROA, DER, Current Ratio,
// Quick Ratio, Dividend, EPS Growth, Revenue Growth, Gross/Operating/Net Margin) - padahal
// dari 13 itu HANYA PE dan PBV yang benar-benar mengukur MURAH/MAHAL harga saham. 11
// lainnya mengukur KUALITAS BISNIS (profitabilitas, likuiditas, pertumbuhan) - sesuatu
// yang beda secara konsep dari valuasi. Kasus KOTA.JK: PE 35.87x (BEARISH/mahal per
// analyzer PE-nya sendiri) dan ROE 4.34% (BEARISH) KALAH SUARA oleh 11 analyzer kualitas
// (margin bagus x3, likuiditas x2, revenue growth 472%, dst) yang mayoritas BULLISH,
// sehingga labelnya kebalik jadi "UNDERVALUED" - istilah yang menjanjikan klaim valuasi
// yang sebenarnya tidak didukung oleh komponen valuasi (PE/PBV) itu sendiri.
//
// PERBAIKAN: dua pertanyaan berbeda dijawab terpisah, TIDAK dicampur jadi satu skor:
// - "Sahamnya murah atau mahal?" -> computeValuationLabel(), dari MOS hasil
//   calculateIntrinsicValue() (DCF/Graham/PER Fair/PBV Fair yang sudah ada di Intrinsic
//   Value) - metode valuasi absolut, bukan vote mayoritas.
// - "Bisnisnya bagus atau buruk?" -> computeFundamentalQuality(), vote 13-analyzer yang
//   SAMA seperti sebelumnya (logika tidak berubah), cuma diberi nama yang jujur soal apa
//   yang sebenarnya diukur - BUKAN "UNDERVALUED/OVERVALUED" lagi.

export interface FundamentalQuality {
  label: 'BAGUS' | 'BURUK' | 'NETRAL';
  /** Persentase vote yang searah dengan label (bulat, 0-100). 0 kalau tidak ada satu pun
   * analyzer yang punya data (bullish+bearish = 0). */
  pct: number;
}

/** Vote 13-analyzer (PE, PBV, ROE, ROA, DER, Current/Quick Ratio, Dividend, EPS Growth,
 * Revenue Growth, Gross/Operating/Net Margin) - jawab "bisnisnya bagus atau buruk",
 * BUKAN "sahamnya murah atau mahal". Ambang 60%/40% dipertahankan sama seperti
 * perhitungan lama (tidak diubah, cuma dipindah & diberi nama baru). */
export function computeFundamentalQuality(bullish: number, bearish: number): FundamentalQuality {
  const totalVotes = bullish + bearish;
  if (totalVotes === 0) return { label: 'NETRAL', pct: 0 };
  const bullPct = (bullish / totalVotes) * 100;
  if (bullPct >= 60) return { label: 'BAGUS', pct: Math.round(bullPct) };
  if (bullPct <= 40) return { label: 'BURUK', pct: Math.round(100 - bullPct) };
  return { label: 'NETRAL', pct: Math.round(bullPct) };
}

/** Label valuasi dari margin of safety (MOS) hasil calculateIntrinsicValue() - metode
 * absolut (Graham Number/PER Fair/PBV Fair/DCF, tergantung bobot sektor), bukan vote
 * mayoritas. `fairValue <= 0` berarti calculateIntrinsicValue() tidak berhasil menghitung
 * nilai wajar apa pun (data kurang) - dilaporkan apa adanya sebagai "DATA TIDAK CUKUP",
 * BUKAN ditebak dari komponen lain. */
export function computeValuationLabel(mos: number, fairValue: number): string {
  if (!fairValue || fairValue <= 0) return 'DATA TIDAK CUKUP';
  const pct = Math.round(Math.abs(mos));
  if (mos > 0) return `UNDERVALUED (MOS +${pct}%)`;
  if (mos < 0) return `OVERVALUED (MOS -${pct}%)`;
  return 'FAIR VALUE (MOS 0%)';
}
