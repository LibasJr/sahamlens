import { pool } from '../../../shared/database/postgres.client';
import { assertDatabaseMigrated } from '../../../shared/database/migration-guard';
import type { JourneyBatch } from '../../../shared/analytics/journey-events';
import {
  summarizeJourneyCounts,
  type JourneyCounts,
  type JourneySummary,
} from '../../../shared/analytics/journey-summary';

/**
 * Penulisan dan pembacaan product_journey_events.
 *
 * Berdiri terpisah dari user.repository.ts karena tabelnya bukan soal pengguna: tidak ada
 * user_id di dalamnya, dan memang tidak boleh ada. Menyatukannya akan mengundang join yang
 * mengubah pengukuran produk menjadi pelacakan orang.
 */

export async function recordJourneyEvents(batch: JourneyBatch): Promise<void> {
  await assertDatabaseMigrated();
  // Satu INSERT untuk seluruh kelompok, bukan satu per event: klien mengirim berkelompok
  // justru supaya jumlah request tidak mengikuti jumlah klik.
  await pool.query(
    `INSERT INTO product_journey_events (visitor_id, session_id, event_name, surface, session_elapsed_ms)
     SELECT $1::uuid, $2::uuid, nama, permukaan, elapsed
       FROM UNNEST($3::text[], $4::text[], $5::int[]) AS t(nama, permukaan, elapsed)`,
    [
      batch.visitorId,
      batch.sessionId,
      batch.events.map((event) => event.name),
      batch.events.map((event) => event.surface),
      batch.events.map((event) => event.elapsedMs),
    ],
  );
}

/**
 * Metrik beta "Calm Intelligence" untuk `periodDays` hari terakhir.
 *
 * Tiga query, bukan satu: yang pertama bertanya per SESI, yang kedua per EVENT, yang
 * ketiga per BROWSER LINTAS HARI. Memaksakannya menjadi satu query menuntut subselect
 * bersarang yang jauh lebih sulit dibaca daripada tiga pertanyaan yang masing-masing
 * jelas maksudnya.
 */
export async function getResearchJourneySummary(periodDays = 30): Promise<JourneySummary> {
  await assertDatabaseMigrated();
  const safeDays = Math.max(1, Math.min(90, Math.floor(periodDays)));

  const [sessionResult, eventResult, watchlistResult] = await Promise.all([
    pool.query<{
      sessions: number;
      searchSessions: number;
      searchToAnalysisSessions: number;
      radarSessions: number;
      radarToAnalysisSessions: number;
      analysisSessions: number;
      evidenceSessions: number;
      medianMsToFirstAnalysis: number | null;
    }>(
      `WITH sesi AS (
         SELECT session_id,
                BOOL_OR(event_name = 'stock_search_submit') AS cari,
                BOOL_OR(event_name = 'radar_candidate_open') AS radar,
                BOOL_OR(event_name = 'stock_analysis_view') AS analisis,
                BOOL_OR(event_name = 'stock_evidence_view') AS bukti,
                MIN(session_elapsed_ms) FILTER (WHERE event_name = 'stock_analysis_view') AS ms_analisis
           FROM product_journey_events
          WHERE created_at >= NOW() - ($1 * INTERVAL '1 day')
          GROUP BY session_id
       )
       SELECT COUNT(*)::int AS "sessions",
              COUNT(*) FILTER (WHERE cari)::int AS "searchSessions",
              COUNT(*) FILTER (WHERE cari AND analisis)::int AS "searchToAnalysisSessions",
              COUNT(*) FILTER (WHERE radar)::int AS "radarSessions",
              COUNT(*) FILTER (WHERE radar AND analisis)::int AS "radarToAnalysisSessions",
              COUNT(*) FILTER (WHERE analisis)::int AS "analysisSessions",
              COUNT(*) FILTER (WHERE analisis AND bukti)::int AS "evidenceSessions",
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ms_analisis)::int AS "medianMsToFirstAnalysis"
         FROM sesi`,
      [safeDays],
    ),
    pool.query<{
      lensaiQuestions: number;
      lensaiQuestionsWithContext: number;
      supportReferencesShown: number;
    }>(
      `SELECT COUNT(*) FILTER (WHERE event_name = 'lensai_question_asked')::int AS "lensaiQuestions",
              COUNT(*) FILTER (WHERE event_name = 'lensai_question_with_stock_context')::int AS "lensaiQuestionsWithContext",
              COUNT(*) FILTER (WHERE event_name = 'support_request_id_shown')::int AS "supportReferencesShown"
         FROM product_journey_events
        WHERE created_at >= NOW() - ($1 * INTERVAL '1 day')`,
      [safeDays],
    ),
    pool.query<{ watchlistVisitors: number; repeatWatchlistVisitors: number }>(
      // "Pemakaian Watchlist berulang" dihitung per HARI BURSA yang berbeda, bukan per
      // kunjungan: membuka tab dua kali dalam satu sore bukan kebiasaan, kembali besok
      // adalah kebiasaan.
      `WITH per_browser AS (
         SELECT visitor_id, COUNT(DISTINCT (created_at AT TIME ZONE 'Asia/Jakarta')::date) AS hari
           FROM product_journey_events
          WHERE event_name = 'watchlist_view'
            AND created_at >= NOW() - ($1 * INTERVAL '1 day')
          GROUP BY visitor_id
       )
       SELECT COUNT(*)::int AS "watchlistVisitors",
              COUNT(*) FILTER (WHERE hari >= 2)::int AS "repeatWatchlistVisitors"
         FROM per_browser`,
      [safeDays],
    ),
  ]);

  const counts: JourneyCounts = {
    periodDays: safeDays,
    sessions: sessionResult.rows[0]?.sessions ?? 0,
    searchSessions: sessionResult.rows[0]?.searchSessions ?? 0,
    searchToAnalysisSessions: sessionResult.rows[0]?.searchToAnalysisSessions ?? 0,
    radarSessions: sessionResult.rows[0]?.radarSessions ?? 0,
    radarToAnalysisSessions: sessionResult.rows[0]?.radarToAnalysisSessions ?? 0,
    analysisSessions: sessionResult.rows[0]?.analysisSessions ?? 0,
    evidenceSessions: sessionResult.rows[0]?.evidenceSessions ?? 0,
    medianMsToFirstAnalysis: sessionResult.rows[0]?.medianMsToFirstAnalysis ?? null,
    lensaiQuestions: eventResult.rows[0]?.lensaiQuestions ?? 0,
    lensaiQuestionsWithContext: eventResult.rows[0]?.lensaiQuestionsWithContext ?? 0,
    supportReferencesShown: eventResult.rows[0]?.supportReferencesShown ?? 0,
    watchlistVisitors: watchlistResult.rows[0]?.watchlistVisitors ?? 0,
    repeatWatchlistVisitors: watchlistResult.rows[0]?.repeatWatchlistVisitors ?? 0,
  };

  return summarizeJourneyCounts(counts);
}
