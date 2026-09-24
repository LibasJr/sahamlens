/**
 * Hasil uji aturan Stop Loss / sasaran yang dipakai halaman Pemindai Harga Masuk.
 *
 * Sumber: scripts/entry-rule-backtest.mjs (baca-saja, deterministik) dijalankan pada arsip
 * harga harian SahamLens 24 Sep 2026. Laporan lengkap: docs/entry-rules/backtest-2026-09-24.md
 *
 * ANGKA DI SINI ADALAH HASIL PENGUKURAN, BUKAN TARGET. Kalau diukur ulang dan hasilnya
 * berubah, ubah angka di sini mengikuti laporan baru — jangan sebaliknya.
 * Versi "executable" (bisa dieksekusi) yang dipakai, karena versi apa adanya pada halaman
 * menghitung level masuk dari jendela yang memuat hari sinyal: pembelian di harga itu tidak
 * mungkin dilakukan, sehingga hasilnya positif semu (lihat `rawWindowArtifact`).
 */

export const ENTRY_RULE_BACKTEST = {
  measuredAt: '2026-09-24',
  archive: {
    firstSession: '2021-08-30',
    lastSession: '2026-09-23',
    rulesTested: 11,
    horizonSessions: 20,
  },
  split: { trainEnd: '2024-12-31', oosStart: '2025-01-01' },
  costRoundTrip: 0.004,
  liquidityFloorIdr: 1_000_000_000,
  executable: {
    filledSignals: 391_325,
    unfilledDays: 1_004_708,
    train: { n: 170_560, stopRate: 0.5621, targetRate: 0.154, timeoutRate: 0.2839, gross: -0.00275, net: -0.00675, medianNet: -0.0162 },
    oos: { n: 220_765, stopRate: 0.5206, targetRate: 0.1917, timeoutRate: 0.2877, gross: 0.00059, net: -0.00341, medianNet: -0.01268 },
  },
  /** Satu-satunya aturan yang netto OOS-nya positif — tetapi netto TRAIN-nya negatif. */
  bestOosRule: { id: 'rr2-chandelier', label: 'Stop Chandelier versi penutupan', trainNet: -0.00245, oosNet: 0.00059 },
  /** Versi "masuk = dasar 20 sesi termasuk hari sinyal": cacat ukur, sengaja dicatat sebagai bukti. */
  rawWindowArtifact: { trainNet: 0.03862, oosNet: 0.04399 },
  gate: 'netto TRAIN > 0 DAN netto OOS > 0 DAN p OOS < 0,05',
  anyRulePassedGate: false,
  reportPath: 'docs/entry-rules/backtest-2026-09-24.md',
  scriptPath: 'scripts/entry-rule-backtest.mjs',
} as const;

export type EntryRuleBacktest = typeof ENTRY_RULE_BACKTEST;