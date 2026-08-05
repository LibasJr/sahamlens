import { MIN_COVERAGE_PCT } from '../../technical/service/scoring.service';

// Semua ambang gerbang kelayakan hidup DI SINI, tidak tersebar sebagai literal di dalam
// fungsi (aturan blueprint quant V2 untuk konstanta berlabel [HYPOTHESIS]).

/** Kebutuhan TEKNIS MA200, bukan pilihan: tanpa 200 bar, MA200 tidak terdefinisi -
 * dan komponen tren yang memakainya bukan sekadar "kurang lengkap", ia tidak ada.
 * Label: [STRUCTURAL], bukan hipotesis. */
export const MIN_BARS = 200;

/** Fallback kalender MASEHI (bukan hari bursa). Aplikasi ini belum punya kalender hari
 * libur bursa IDX, jadi blueprint §5.3-G2 menetapkan fallback: hari kalender dengan
 * ambang 5 - cukup longgar untuk akhir pekan + satu hari libur nasional, tapi tetap
 * menangkap data yang benar-benar basi. Label: [HYPOTHESIS]. */
export const MAX_STALE_CALENDAR_DAYS = 5;

/** Volume nol berturut-turut. Label: [HYPOTHESIS]. */
export const MAX_ZERO_VOL_DAYS = 3;

/** Volume nol dalam 20 bar terakhir (tidak harus berturut-turut). Label: [HYPOTHESIS]. */
export const MAX_ZERO_VOL_IN_20 = 8;

/** ADV20 = rata-rata (close x volume) 20 bar terakhir, dalam rupiah. Konsisten dengan
 * kriteria universe yang sudah dipakai `scripts/backtest-universe-refresh.mjs`.
 * Label: [HYPOTHESIS] sampai divalidasi backtest. */
export const ADV_HARD_FLOOR_IDR = 1_000_000_000;

/** Ambang kelengkapan data - SATU sumber dengan getKategori()/'DATA TIDAK CUKUP' di
 * scoring.service.ts, sengaja di-reexport alih-alih ditulis ulang supaya dua lapisan
 * ini tidak bisa berbeda pendapat tentang saham yang sama. */
export const MIN_COVERAGE_FOR_RECOMMENDATION = MIN_COVERAGE_PCT;
