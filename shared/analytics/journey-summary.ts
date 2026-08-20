/**
 * Perhitungan metrik beta dari hitungan mentah.
 *
 * Dipisah dari SQL-nya supaya aturan-aturan kecil yang gampang salah - penyebut nol,
 * pembulatan, satuan - bisa diuji tanpa database. Repository hanya menghitung; berkas ini
 * yang memutuskan artinya.
 */

export interface JourneyCounts {
  periodDays: number;
  /** Sesi = satu kunjungan (satu tab, sampai ditutup). */
  sessions: number;
  searchSessions: number;
  searchToAnalysisSessions: number;
  radarSessions: number;
  radarToAnalysisSessions: number;
  analysisSessions: number;
  evidenceSessions: number;
  /** Median jarak dari awal sesi ke halaman analisis pertama. Null = belum ada satu pun. */
  medianMsToFirstAnalysis: number | null;
  lensaiQuestions: number;
  lensaiQuestionsWithContext: number;
  supportReferencesShown: number;
  watchlistVisitors: number;
  repeatWatchlistVisitors: number;
}

export interface JourneySummary extends JourneyCounts {
  /** Sesi yang mencari lalu benar-benar membuka analisis. */
  searchToAnalysisPct: number | null;
  /** Sesi yang membuka kandidat LensRadar lalu membuka analisis. */
  radarToAnalysisPct: number | null;
  /** Sesi yang menembus dari ringkasan ke buktinya. */
  summaryToEvidencePct: number | null;
  /** Pertanyaan LensAI yang diajukan sambil ada emiten di konteks layar. */
  lensaiWithContextPct: number | null;
  /** Browser yang membuka Watchlist di lebih dari satu hari. */
  repeatWatchlistPct: number | null;
  medianSecondsToFirstAnalysis: number | null;
}

/**
 * Persen, atau null kalau tidak ada yang bisa dipersenkan.
 *
 * Null dan 0 SENGAJA dibedakan: "0%" berarti ada yang mencoba dan tidak satu pun lanjut -
 * temuan produk yang nyata. "Belum ada data" berarti pertanyaannya belum terjawab. Panel
 * admin menampilkan keduanya berbeda, jadi keduanya harus berbeda di sini juga.
 */
function pct(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

export function summarizeJourneyCounts(counts: JourneyCounts): JourneySummary {
  return {
    ...counts,
    searchToAnalysisPct: pct(counts.searchToAnalysisSessions, counts.searchSessions),
    radarToAnalysisPct: pct(counts.radarToAnalysisSessions, counts.radarSessions),
    summaryToEvidencePct: pct(counts.evidenceSessions, counts.analysisSessions),
    lensaiWithContextPct: pct(counts.lensaiQuestionsWithContext, counts.lensaiQuestions),
    repeatWatchlistPct: pct(counts.repeatWatchlistVisitors, counts.watchlistVisitors),
    medianSecondsToFirstAnalysis: counts.medianMsToFirstAnalysis === null
      ? null
      : Math.round(counts.medianMsToFirstAnalysis / 100) / 10,
  };
}
