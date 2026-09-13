import {
  analyzeOfficialForeignFlow,
  getRealForeignFlow,
  type OfficialForeignFlowAnalysis,
} from '../../market';
import { MAX_STALE_CALENDAR_DAYS } from '../../eligibility';

/**
 * Menyalakan masukan arus dana asing RESMI untuk TradePlan v1.0.
 *
 * Sebelum berkas ini ada, `ai-pick-scan.service.ts` mengirim `officialNetPressure20: null`
 * dan `officialPositiveRatio20: null` sebagai literal. Akibatnya SETIAP TradePlan selalu
 * melaporkan "Foreign flow IDX resmi 20D" hilang, dan `confidenceLevel` nyaris mustahil
 * mencapai HIGH karena syaratnya `missingData.length <= 1` - padahal artefak resminya ada
 * di `data/foreign-flow/`, 962 emiten, ditulis `scripts/sync-idx-foreign-flow.py` dari
 * endpoint Bursa. Jadi ini bukan penambahan data baru: ini menyambungkan data yang sudah
 * dikumpulkan tapi dibuang sebelum dipakai.
 *
 * ===================================================================================
 * NOL BUKAN DATA
 * ===================================================================================
 * Artefak ADA untuk emiten yang nyaris tidak ditransaksikan, dan isinya nol semua.
 * Terukur 13 September 2026 pada `data/foreign-flow/POOL.json`: seluruh `high`, `low`,
 * `open`, `volume`, `foreignBuy`, `foreignSell` bernilai `0.0` untuk 90 baris.
 *
 * Kalau nol diperlakukan sebagai pengamatan, TradePlan akan melaporkan "arus asing
 * netral, data tersedia" untuk saham yang sebenarnya tidak punya transaksi asing sama
 * sekali - percaya diri palsu, persis kebalikan dari tujuan `missingData`.
 *
 * Dua penjaga menutupnya:
 *
 * 1. `analyzeOfficialForeignFlow` sudah mengembalikan `netPressure20: null` saat turnover
 *    asing nol (fungsi `tekanan()` membagi dengan turnover dan menolak pembagi <= 0).
 *    Itu dipakai apa adanya di sini, tidak ditambal.
 * 2. `observedDays` wajib mencapai `MIN_OBSERVED_DAYS`. Jendela 20 hari yang cuma terisi
 *    tiga hari bukan "rasio hari beli 67%", itu kebetulan.
 *
 * ===================================================================================
 * ARTEFAK BASI DITOLAK, TIDAK DIPAKAI DIAM-DIAM
 * ===================================================================================
 * Artefak ditulis oleh skrip sinkronisasi terjadwal. Kalau skripnya berhenti jalan,
 * berkasnya TETAP ADA dan TETAP bisa dibaca - hanya isinya yang tertinggal. Membaca
 * berkas yang sukses tidak membuktikan datanya segar.
 *
 * Ambangnya memakai `MAX_STALE_CALENDAR_DAYS` yang sudah dipakai gerbang kelayakan, jadi
 * TradePlan dan LensScore memakai definisi "basi" yang sama alih-alih dua angka yang
 * bisa bergeser sendiri-sendiri.
 */

/** Jendela penuh 20 hari bursa. Di bawah ini rasio dan tekanan dihitung dari sampel yang
 * terlalu kecil untuk dilaporkan sebagai persistensi. Label: [HYPOTHESIS]. */
export const MIN_OBSERVED_DAYS = 10;

export type TradePlanFlowRejection =
  | 'NO_ARTIFACT'
  | 'NO_FOREIGN_TURNOVER'
  | 'WINDOW_TOO_SHORT'
  | 'STALE_ARTIFACT';

export interface TradePlanOfficialFlow {
  officialNetPressure20: number | null;
  officialPositiveRatio20: number | null;
  /** Kenapa datanya tidak dipakai. `null` saat dipakai - supaya pemanggil dan test bisa
   * membedakan "tidak ada artefak" dari "artefak ada tapi ditolak", bukan sama-sama null. */
  rejection: TradePlanFlowRejection | null;
  latestDate: string | null;
  observedDays: number;
}

const TIDAK_DIPAKAI = (
  rejection: TradePlanFlowRejection,
  latestDate: string | null,
  observedDays: number,
): TradePlanOfficialFlow => ({
  officialNetPressure20: null,
  officialPositiveRatio20: null,
  rejection,
  latestDate,
  observedDays,
});

const MS_PER_DAY = 86_400_000;

/** Selisih hari KALENDER antara tanggal artefak dan sekarang, dihitung di UTC tengah hari
 * supaya pergeseran zona waktu tidak menggeser hasilnya satu hari. */
export function calendarDaysSince(latestDate: string, now: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(latestDate);
  if (!match) return null;

  const bar = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  return Math.round((today - bar) / MS_PER_DAY);
}

/**
 * Bagian MURNI: memutuskan apakah analisis arus asing boleh masuk TradePlan.
 *
 * Dipisah dari pembacaan berkas supaya keputusannya bisa diuji tanpa menyentuh disk,
 * dan supaya penjaga nol/basi/jendela-pendek tidak ikut terlewat kalau suatu saat
 * sumber artefaknya berpindah.
 */
export function resolveTradePlanOfficialFlow(
  analysis: OfficialForeignFlowAnalysis | null,
  now: Date,
): TradePlanOfficialFlow {
  if (!analysis) return TIDAK_DIPAKAI('NO_ARTIFACT', null, 0);

  const { latestDate, observedDays } = analysis;

  // Turnover asing nol -> netPressure20 null. Artefak ada, transaksinya tidak.
  if (analysis.netPressure20 == null || analysis.positiveRatio20 == null) {
    return TIDAK_DIPAKAI('NO_FOREIGN_TURNOVER', latestDate, observedDays);
  }

  if (observedDays < MIN_OBSERVED_DAYS) {
    return TIDAK_DIPAKAI('WINDOW_TOO_SHORT', latestDate, observedDays);
  }

  const age = latestDate == null ? null : calendarDaysSince(latestDate, now);
  if (age == null || age > MAX_STALE_CALENDAR_DAYS) {
    return TIDAK_DIPAKAI('STALE_ARTIFACT', latestDate, observedDays);
  }

  return {
    officialNetPressure20: analysis.netPressure20,
    officialPositiveRatio20: analysis.positiveRatio20,
    rejection: null,
    latestDate,
    observedDays,
  };
}

/** Pembungkus IO: baca artefak resmi lalu jalankan keputusan murni di atas. */
export function readTradePlanOfficialFlow(ticker: string, now: Date = new Date()): TradePlanOfficialFlow {
  const series = getRealForeignFlow(ticker, 20);
  const analysis = series ? analyzeOfficialForeignFlow(series.history) : null;
  return resolveTradePlanOfficialFlow(analysis, now);
}
