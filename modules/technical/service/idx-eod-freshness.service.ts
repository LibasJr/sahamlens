import { isTradingDay } from '@/shared/calendar/idx-trading-calendar';

/**
 * Penjaga kesegaran artefak EOD IDX.
 *
 * ===================================================================================
 * KENAPA HARI BURSA, BUKAN HARI KALENDER
 * ===================================================================================
 * Ini bukan detail kosmetik - ia menentukan apakah penjaga ini berguna atau langsung
 * diabaikan.
 *
 * Setiap Senin pagi, artefak terbaru berumur 3 hari kalender (Jumat -> Senin). Penjaga
 * berbasis hari kalender akan MERAH setiap Senin, plus setiap hari setelah libur
 * panjang. Penjaga yang memerah untuk keadaan normal berhenti dibaca orang dalam
 * seminggu, dan saat itu ia justru menyembunyikan kemacetan yang sungguhan.
 *
 * Penulis catatan ini sempat menyimpulkan "sync macet, Jumat 12 Sep bolong" - padahal
 * 12 September 2026 adalah Sabtu. Artefaknya segar. Kesimpulan itu lahir persis dari
 * menghitung hari kalender alih-alih hari bursa.
 *
 * ===================================================================================
 * MENANDAI, BUKAN MEMBUANG
 * ===================================================================================
 * Artefak basi TIDAK ditolak. Data EOD resmi Bursa yang berumur dua hari tetap lebih
 * akurat daripada tidak ada, dan Yahoo sudah menjadi tulang punggung kalender sehingga
 * sesi terbaru tetap muncul. Yang berubah hanya: keadaan ini sekarang punya nama dan
 * jejak, bukan lolos sebagai "sehat".
 */

/**
 * Toleransi dalam HARI BURSA. 1 berarti "artefak boleh tertinggal satu hari bursa".
 *
 * Sinkronisasi berjalan pukul 17:30 WIB setelah bursa tutup, jadi sepanjang sesi
 * berjalan artefak memang menunjuk hari bursa sebelumnya - itu normal, bukan basi.
 */
export const IDX_EOD_STALENESS_TRADING_DAYS = 1;

export type IdxEodFreshness = 'FRESH' | 'STALE';

export interface IdxEodFreshnessResult {
  freshness: IdxEodFreshness;
  /** Jarak dalam hari bursa antara tanggal baris terakhir dan `now`. */
  tradingDaysBehind: number;
  latestTradeDate: string;
  /** Alasan yang bisa dibaca manusia; null saat FRESH. */
  reason: string | null;
}

/**
 * Menghitung jumlah hari BURSA dari `fromDateKey` (eksklusif) sampai `now` (inklusif).
 *
 * Dibatasi 30 iterasi: artefak yang tertinggal lebih dari sebulan bursa sudah pasti
 * bermasalah, dan angka pastinya tidak menambah informasi apa pun.
 */
export function countTradingDaysBetween(fromDateKey: string, now: Date): number {
  const MAX_LOOKBACK = 30;
  const cursor = new Date(`${fromDateKey}T00:00:00+07:00`);
  const nowKey = jakartaDateKey(now);

  let count = 0;
  for (let i = 0; i < MAX_LOOKBACK; i += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const key = jakartaDateKey(cursor);
    if (key > nowKey) break;
    if (isTradingDay(cursor)) count += 1;
  }
  return count;
}

/** Kunci tanggal di zona bursa. `toISOString()` akan meleset sehari untuk waktu sore WIB. */
export function jakartaDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function assessIdxEodFreshness(
  latestTradeDate: string,
  now: Date = new Date(),
  toleranceTradingDays: number = IDX_EOD_STALENESS_TRADING_DAYS,
): IdxEodFreshnessResult {
  const dateKey = latestTradeDate.slice(0, 10);
  const tradingDaysBehind = countTradingDaysBetween(dateKey, now);

  if (tradingDaysBehind <= toleranceTradingDays) {
    return { freshness: 'FRESH', tradingDaysBehind, latestTradeDate: dateKey, reason: null };
  }

  return {
    freshness: 'STALE',
    tradingDaysBehind,
    latestTradeDate: dateKey,
    reason:
      `artefak EOD IDX tertinggal ${tradingDaysBehind} hari bursa ` +
      `(baris terakhir ${dateKey}, toleransi ${toleranceTradingDays}) - ` +
      `periksa sahamlens-idx-flow-sync.timer`,
  };
}
