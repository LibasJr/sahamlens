/**
 * Kunci cache untuk hasil komputasi berat yang dipakai LEBIH DARI SATU pemanggil.
 *
 * Dibuat 2026-08-13 saat LensAI (chat) mulai membaca hasil yang sudah dihitung route
 * publik + cron. Sebelumnya tiap route mendeklarasikan literal string-nya sendiri di
 * dalam file route - aman selama cuma satu pembaca, tapi begitu ada pembaca kedua,
 * satu huruf yang berbeda membuat pembaca kedua diam-diam selalu cache-miss. Untuk
 * LensAI kegagalannya tidak terlihat sama sekali: blok datanya cuma berisi "belum
 * tersedia", dan jawabannya jadi lebih miskin tanpa satu pun error.
 *
 * Aturannya: kunci yang dibaca lebih dari satu modul WAJIB dari sini, bukan disalin.
 */
import { COMPUTED_CACHE_VERSION } from './cache-version';

// MARKET_SUMMARY WAJIB versi yang sama dengan app/api/daily-picks/route.ts dan
// app/api/cron/market-summary/route.ts (keduanya membaca kunci ini juga) - kalau
// tidak, sama persis dengan masalah yang dijelaskan di atas: satu pembaca diam-diam
// selalu cache-miss karena versinya beda satu karakter.
export const COMPUTED_CACHE_KEY = {
  MARKET_SUMMARY: `sahamlens:cache:computed:market-summary:${COMPUTED_CACHE_VERSION}`,
  MARKET_PULSE: 'sahamlens:cache:computed:market-pulse:v2',
  SCREENER_UNIVERSE: 'sahamlens:cache:computed:screener-universe',
  DIVIDEND_UNIVERSE: 'sahamlens:cache:computed:dividend-universe',
  CORPORATE_CALENDAR: 'sahamlens:cache:computed:corporate-calendar',
  MACRO_DASHBOARD: 'sahamlens:cache:computed:macro-dashboard',
  MARKET_NEWS: 'sahamlens:cache:computed:market-news:v2',
} as const;
