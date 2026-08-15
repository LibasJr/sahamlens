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
import { ACTIVE_LIQUID_UNIVERSE_VERSION } from '../../modules/market/constants/ai-pick-universe';

// MARKET_SUMMARY menggunakan versi khusus karena arti field `timestamp` berubah dari
// jam worker menjadi waktu quote sumber. Kunci v3 mencegah cache v2 yang masih hidup
// sampai tiga hari menyamar sebagai snapshot pasar baru. Semua pembaca/penulis wajib
// memakai konstanta ini agar tidak terjadi cache-miss silang.
export const COMPUTED_CACHE_KEY = {
  MARKET_SUMMARY: 'sahamlens:cache:computed:market-summary:v3',
  // v3 menambah daftar quote breadth + timestamp sesi sumber. Kunci baru menjaga
  // respons cache v2 lama (tanpa daftar) tidak terlihat seperti snapshot lengkap.
  MARKET_PULSE: 'sahamlens:cache:computed:market-pulse:v3',
  SCREENER_UNIVERSE: `sahamlens:cache:computed:screener-universe:${ACTIVE_LIQUID_UNIVERSE_VERSION}`,
  DIVIDEND_UNIVERSE: 'sahamlens:cache:computed:dividend-universe',
  CORPORATE_CALENDAR: 'sahamlens:cache:computed:corporate-calendar',
  MACRO_DASHBOARD: 'sahamlens:cache:computed:macro-dashboard',
  MARKET_NEWS: 'sahamlens:cache:computed:market-news:v2',
} as const;
