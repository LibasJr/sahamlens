// TIPE INTI OWNERSHIP FLOW.
//
// Ownership Flow BUKAN ganti nama Broker Summary. Keduanya mengukur hal yang
// BERBEDA secara fundamental - lihat docs/ownership-flow/broker-vs-ownership.md:
//   - Broker Summary  : TRANSAKSI per kode broker pada satu hari bursa.
//   - Ownership Flow  : KOMPOSISI KEPEMILIKAN efek pada satu tanggal observasi.
//
// Kenaikan foreign ownership TIDAK boleh disimpulkan sebagai "broker asing X
// membeli". Tanpa data broker-level, klaim itu tidak punya dasar.

/** Status audit sumber data. Ingestion FAIL-CLOSED selama masih UNVERIFIED. */
export type SourceAuditStatus = 'UNVERIFIED' | 'VERIFIED' | 'PROHIBITED';

/** Cadence publikasi sumber. Menentukan ambang staleness - JANGAN dihardcode
 * "3 hari" untuk sumber yang terbit bulanan. */
export type SourceCadence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'UNKNOWN';

export type SourceFormat = 'HTML' | 'CSV' | 'XLS' | 'XLSX' | 'JSON' | 'UNKNOWN';

/**
 * Satu observasi kepemilikan untuk satu ticker pada satu tanggal.
 *
 * `observedDate` = tanggal yang DINYATAKAN SUMBER ("as of ..."), bukan tanggal
 * cron berjalan. `fetchedAt` = kapan server kita mengambilnya. Keduanya wajib
 * dibedakan; menyamakannya merusak seluruh dasar backtest point-in-time.
 */
export interface OwnershipObservation {
  /** Ticker internal, selalu bersufiks `.JK` (lihat normalizeOwnershipTicker). */
  ticker: string;
  /** YYYY-MM-DD, tanggal posisi menurut SUMBER. */
  observedDate: string;
  /** Persentase kepemilikan lokal, 0..100. null = sumber tidak menyediakannya. */
  localPct: number | null;
  /** Persentase kepemilikan asing, 0..100. null = sumber tidak menyediakannya. */
  foreignPct: number | null;
  /** Persentase efek scripless (tercatat di C-BEST), 0..100. */
  scriplessPct: number | null;
  /** Jumlah efek pada posisi tersebut. Integer besar - disimpan NUMERIC. */
  totalSecurities: number | null;
  localShares: number | null;
  foreignShares: number | null;
  /** Identitas sumber, mis. `KSEI_HOLDING_COMPOSITION`. */
  source: string;
  /** URL persis yang menjadi asal baris ini - kolom provenance. */
  sourceUrl: string;
  /** ISO-8601 UTC, waktu pengambilan oleh server kita. */
  fetchedAt: string;
  /** Hasil validasi baris. Baris non-VALID TIDAK PERNAH dipersist. */
  quality: DataQualityFlag;
}

/**
 * Flag kualitas data.
 *
 * Pembedaan ini bukan kosmetik - masing-masing menuntut tindakan berbeda dari
 * operator:
 *
 * - `MISSING`          : sumber tidak menyediakan kolomnya sama sekali.
 * - `INCONSISTENT`     : angkanya ADA tapi gagal pemeriksaan silang
 *                        (local + foreign menyimpang dari scripless).
 * - `PLACEHOLDER_DATA` : halaman emitennya ASLI tapi nilainya 0/0/0 - halaman
 *                        belum memuat data. Ditemukan pada fixture TLKM nyata
 *                        (2026-08-16). Ini BUKAN kegagalan jaringan dan BUKAN
 *                        kesalahan parser; menaikkan retry tidak menolongnya.
 * - `SOURCE_ERROR`     : gagal mengambil halaman (jaringan/HTTP) setelah retry.
 * - `STALE`            : ada, tapi lebih tua dari cadence sumber.
 *
 * Hanya `VALID` yang boleh masuk database.
 */
export type DataQualityFlag =
  | 'VALID'
  | 'MISSING'
  | 'INCONSISTENT'
  | 'PLACEHOLDER_DATA'
  | 'STALE'
  | 'SOURCE_ERROR';

/** Baris yang ditolak parser, lengkap dengan alasannya - masuk laporan cron. */
export interface RejectedRow {
  ticker: string | null;
  reason: string;
  quality: Exclude<DataQualityFlag, 'VALID'>;
}

/**
 * Selisih kepemilikan antara observasi terkini dan observasi pembanding.
 *
 * SATUANNYA PERCENTAGE POINT (pp), BUKAN persen relatif. 40.00% -> 41.00%
 * adalah +1.00 pp (dan +2.5% relatif). UI wajib menulis "pp". Lihat §36.
 */
export interface OwnershipDelta {
  /** Selisih dalam percentage point. null = tidak ada observasi pembanding. */
  pp: number | null;
  /** Tanggal observasi yang benar-benar dipakai sebagai pembanding. */
  basisObservedDate: string | null;
  /**
   * Jarak hari kalender nyata antara observasi terkini dan pembandingnya.
   *
   * WAJIB ditampilkan bersama delta: kalau sumber terbit bulanan, "Δ 7D" bisa
   * saja dihitung dari observasi 30 hari lalu. Menyembunyikan angka ini membuat
   * label horizon berbohong tentang data di belakangnya.
   */
  actualGapDays: number | null;
}

export interface OwnershipDeltaSet {
  d1: OwnershipDelta;
  d7: OwnershipDelta;
  d30: OwnershipDelta;
}

/**
 * Klasifikasi DESKRIPTIF - menggambarkan apa yang terjadi pada angka, bukan
 * memprediksi harga. Tidak ada BUY/SELL di sini, dan tidak akan pernah ada:
 * Ownership Flow adalah supplemental evidence, bukan sinyal transaksi.
 *
 * `DATA_ONLY` adalah default selama ambang belum divalidasi dari distribusi
 * historis nyata. Lebih baik menampilkan angka mentah daripada label karangan.
 */
export type OwnershipTrend =
  | 'FOREIGN_ACCUMULATION'
  | 'FOREIGN_DISTRIBUTION'
  | 'STABLE'
  | 'DATA_ONLY'
  | 'INSUFFICIENT_DATA';

export type FreshnessStatus = 'FRESH' | 'STALE' | 'MISSING';

/** Payload yang dilayani API per ticker. */
export interface OwnershipFlowView {
  ticker: string;
  observedDate: string | null;
  source: string | null;
  sourceUrl: string | null;
  fetchedAt: string | null;
  foreignPct: number | null;
  localPct: number | null;
  scriplessPct: number | null;
  totalSecurities: number | null;
  delta: OwnershipDeltaSet;
  trend: OwnershipTrend;
  /** Kalimat yang menjelaskan KENAPA trend-nya begitu - dipakai UI & LensAI. */
  trendReason: string;
  freshness: FreshnessStatus;
  /** Umur data dalam hari kalender terhadap "sekarang". */
  ageDays: number | null;
  /** Cadence sumber, supaya UI bisa menjelaskan ekspektasi pembaruan. */
  cadence: SourceCadence;
  /** SELALU true pada fase ini. Ownership Flow belum tervalidasi. */
  experimental: true;
  /** SELALU false pada fase ini. Tidak ikut menghitung LensScore. */
  inFinalScore: false;
  /** Jumlah observasi historis yang tersedia - dasar kejujuran "history cukup?". */
  historyCount: number;
}
