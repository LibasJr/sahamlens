// Komposisi LensScore - SUMBER TUNGGAL. File ini sengaja tidak mengimpor apa pun (pola
// yang sama dengan access.ts & limits.ts) supaya bisa dipakai modul mana pun tanpa
// menciptakan ketergantungan silang antar-domain.
//
// Sebelumnya angka yang sama hidup di DUA tempat yang tidak saling tahu:
//   1. modules/technical/service/scoring.service.ts - combine([...], 40/30/30), yaitu
//      bobot yang BENAR-BENAR dipakai menghitung skor produksi.
//   2. modules/lens-radar/service/lens-score-optimizer.service.ts - CURRENT_WEIGHTS,
//      dipakai calibration lab sebagai BASELINE pembanding proposal bobot baru.
//
// Keduanya kebetulan masih sama. Kalau salah satu diubah tanpa yang lain, calibration lab
// akan membandingkan proposal terhadap baseline yang tidak pernah dipakai siapa pun -
// angkanya tetap terlihat meyakinkan (spread, p-value, sampel semua terisi) padahal
// membandingkan terhadap sesuatu yang tidak ada. Kegagalan diam-diam seperti itu justru
// yang paling mahal di sistem scoring.
//
// CARA MENGUBAH: ubah angka di sini, jalankan `npm test` (ada test yang menjaga totalnya
// tetap 100), commit dengan alasannya, lalu deploy. Tidak ada jalur lain - panel admin
// /admin/calibration sengaja TIDAK punya tombol yang mengubah nilai ini saat runtime.
export interface LensScoreWeights {
  technical: number;
  fundamental: number;
  flow: number;
}

export const LENS_SCORE_WEIGHTS: LensScoreWeights = {
  technical: 40,
  fundamental: 30,
  flow: 30,
};

/** Penyebut skor akhir. Selalu 100 selama bobot di atas berjumlah 100 - dihitung, bukan
 * ditulis ulang sebagai angka ajaib. */
export const LENS_SCORE_TOTAL_WEIGHT =
  LENS_SCORE_WEIGHTS.technical + LENS_SCORE_WEIGHTS.fundamental + LENS_SCORE_WEIGHTS.flow;
