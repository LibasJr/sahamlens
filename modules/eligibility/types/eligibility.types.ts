// LAPISAN KELAYAKAN MINIMAL - Phase 0 (P0-3).
//
// Ini BUKAN Eligibility Engine penuh dari blueprint §5. Yang diimplementasikan di sini
// hanya gerbang yang bisa ditegakkan dari data yang BENAR-BENAR tersedia hari ini
// (OHLCV Yahoo + coverage skor), yaitu skenario paling berbahaya: saham tidak likuid,
// saham yang kemungkinan tidak diperdagangkan, data basi, histori terlalu pendek, dan
// data terlalu tipis. Gerbang sisanya (EXTREME_VOLATILITY, ABNORMAL_PRICE_MOVEMENT/
// ARA-ARB, CORPORATE_ACTION_REVIEW) menyusul di Phase 1 bersama modul penuhnya.

export type EligibilityStatus =
  | 'ELIGIBLE'
  | 'INSUFFICIENT_DATA'
  | 'INSUFFICIENT_HISTORY'
  | 'STALE_DATA'
  /** SENGAJA bukan 'SUSPENDED': aplikasi ini TIDAK punya feed suspensi resmi IDX.
   * Yang benar-benar diukur cuma "tidak ada volume tercatat selama N hari" - itu
   * PROXY. Menamainya SUSPENDED berarti mengklaim fakta bursa yang tidak pernah
   * kita baca dari sumber resmi manapun. */
  | 'POSSIBLY_NOT_TRADED'
  | 'LOW_LIQUIDITY';

export interface EligibilityBar {
  /** YYYY-MM-DD */
  date: string;
  close: number | null;
  /** `null` = bar tanpa data volume (Yahoo kadang begitu untuk hari libur), BUKAN
   * volume nol. Dua hal berbeda: yang pertama "tidak tahu", yang kedua "tidak ada
   * transaksi". Hanya yang kedua yang boleh memicu POSSIBLY_NOT_TRADED. */
  volume: number | null;
}

export interface EligibilityInput {
  ticker: string;
  /** Tanggal evaluasi (YYYY-MM-DD), biasanya tanggal kalender WIB hari ini. */
  asOf: string;
  /** Urut NAIK menurut tanggal. */
  bars: EligibilityBar[];
  /** `coverage_pct` dari calculateScore(), kalau sudah dihitung pemanggil.
   * `null`/undefined = gerbang INSUFFICIENT_DATA dilewati (bukan dianggap lolos -
   * lihat catatan di evaluateMinimalEligibility). */
  coveragePct?: number | null;
}

export interface EligibilityResult {
  status: EligibilityStatus;
  /** SEMUA gerbang yang aktif, bukan cuma yang berprioritas tertinggi. */
  reasonCodes: string[];
  /** true = skor tidak bermakna, jangan dihitung/ditampilkan sebagai analisis.
   * false = angka boleh ditampilkan, rekomendasinya yang tidak boleh. */
  blocking: boolean;
  /** false = BUY/STRONG BUY dilarang menjadi rekomendasi actionable. */
  advisory: boolean;
  /** Kalimat siap tampil, bahasa Indonesia, tanpa klaim yang tidak terukur. */
  message: string | null;
  details: {
    bars: number;
    lastBarDate: string | null;
    calendarDaysSinceLastBar: number | null;
    consecutiveZeroVolumeDays: number;
    zeroVolumeDaysIn20: number;
    adv20Idr: number | null;
    coveragePct: number | null;
  };
}
