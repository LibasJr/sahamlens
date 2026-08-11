/**
 * Periode simulasi backtest - satu sumber untuk API, UI, dan precompute.
 *
 * Dikumpulkan di sini (2026-08-12, saat periode diperpanjang ke 60 bulan) karena ketiganya
 * harus sepakat dan sebelumnya tidak ada yang memaksanya: daftar periode ditulis sebagai
 * literal di `app/api/backtest/route.ts`, daftar `<option>` ditulis ulang di
 * `app/backtest/page.tsx`, dan panjang histori yang benar-benar disimpan ditentukan
 * `RETAIN_DAYS` di file ketiga. Kalau salah satunya berubah sendirian, gejalanya BUKAN
 * error - melainkan hasil backtest kosong tanpa penjelasan, karena tidak ada satu pun
 * emiten yang punya bar sebanyak yang diminta jendelanya.
 *
 * Invariannya diuji: max(BACKTEST_PERIOD_MONTHS) x TRADING_DAYS_PER_MONTH <= RETAIN_DAYS.
 */

/**
 * Aproksimasi hari bursa per bulan, dipakai memotong jendela simulasi.
 *
 * IDX sesungguhnya sekitar 241 hari bursa setahun (diukur dari bar ^JKSE 2026-08-12: 1.206
 * bar dalam 5 tahun), yaitu ~20,1 hari/bulan. Angka 22 karena itu memotong jendela sekitar
 * 9% lebih panjang daripada label bulannya - "60 bulan" berarti 1.320 bar = ~5,5 tahun
 * kalender, bukan tepat 5.
 *
 * TIDAK diubah ke 20,1: mengubahnya akan menggeser hasil setiap periode yang pernah dilihat
 * pengguna tanpa memperbaiki apa pun yang salah secara finansial. Yang diperbaiki adalah
 * pelaporannya - `performance.years` menghitung rentang tahun dari tanggal sungguhan, jadi
 * angka yang dipakai membaca hasil tidak lagi bergantung pada aproksimasi ini.
 */
export const TRADING_DAYS_PER_MONTH = 22;

/** Periode yang boleh diminta, dalam bulan. Urut naik. */
export const BACKTEST_PERIOD_MONTHS = [3, 6, 12, 24, 36, 60] as const;

export type BacktestPeriodMonths = (typeof BACKTEST_PERIOD_MONTHS)[number];

/** Bar bursa yang dibutuhkan periode terpanjang. Precompute wajib menyimpan minimal ini. */
export const MAX_BACKTEST_TRADING_DAYS =
  Math.max(...BACKTEST_PERIOD_MONTHS) * TRADING_DAYS_PER_MONTH;
