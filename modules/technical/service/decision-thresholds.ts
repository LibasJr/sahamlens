// Satu titik dokumentasi untuk ambang batas keputusan yang tersebar sebagai magic
// number di file berbeda (audit integritas data 2026-08-03, temuan M-04).
//
// PENTING - ini BUKAN penyatuan menjadi satu angka: SCORING_KATEGORI_THRESHOLDS dan
// ORCHESTRATOR_SCORE_THRESHOLDS mengukur DUA SKOR KOMPOSIT YANG BERBEDA, bukan cuma
// cutoff berbeda dari kuantitas yang sama:
//   - scoring.service.ts:getKategori() menilai total_score dari calculateScore()
//     (Technical 40 + Fundamental 30 + Flow 30) - dipakai Screener, Recommendation,
//     Detail Saham, Council AI.
//   - orchestrator.service.ts:decisionFromScore() menilai weighted score dari 9 agen
//     kuantitatif (technical/momentum/flow/pattern/risk/fundamental/valuation/bandar/
//     news) - dipakai HANYA /multi-agent, komposisi agennya sengaja lebih luas.
// Memaksa angkanya identik tanpa menyamakan model yang mendasarinya justru
// menyembunyikan perbedaan nyata di balik angka yang kelihatan konsisten - jadi
// keduanya didokumentasikan berdampingan DI SINI (satu file, mudah dibandingkan &
// diaudit), tapi nilainya sengaja tetap terpisah.
//
// Kasus yang BENAR-BENAR diduplikasi (kuantitas identik: persentase vote bullish/
// bearish dari analyzer yang sama) SUDAH disatukan sepenuhnya - lihat
// modules/technical/service/consensus.service.ts:calculateConsensus(), dipakai oleh
// app/api/stock/[ticker]/route.ts DAN modules/recommendation/service/
// recommendation.service.ts (sebelumnya recommendation.service.ts punya salinan logika
// sendiri dengan cutoff 70/50/30 vs 80/60 - lihat temuan M-04 di audit).
export const SCORING_KATEGORI_THRESHOLDS = {
  STRONG_BUY: 75, // total_score > 75
  BUY: 60,        // total_score >= 60
  HOLD: 45,       // total_score >= 45 (di bawahnya: SELL)
} as const;

export const ORCHESTRATOR_SCORE_THRESHOLDS = {
  STRONG_BUY: 65, // final_score >= 65
  BUY: 55,        // final_score >= 55
  HOLD: 45,       // final_score > 45 (>45 dan <55: HOLD)
  SELL: 35,       // final_score > 35 (>35 dan <=45: SELL, di bawahnya: STRONG SELL)
} as const;

// Ambang vote konsensus (persentase bullish/bearish dari analyzer teknikal murni) -
// dipakai calculateConsensus(), SATU-SATUNYA definisi (lihat catatan di atas).
export const CONSENSUS_VOTE_THRESHOLDS = {
  STRONG: 80, // >= 80% vote satu arah -> STRONG BUY/STRONG SELL
  NORMAL: 60, // >= 60% vote satu arah -> BUY/SELL
} as const;
