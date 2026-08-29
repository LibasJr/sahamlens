// LensIntraday - identitas model RISET yang SENGAJA TERPISAH dari LensScore T+20.
//
// Tidak ada satu pun konstanta di file ini yang dibaca oleh scoring produksi
// (modules/lens-radar/constants/model-version.ts, SCORE_VERSION lens-score-v1.6.1,
// bobot Teknikal 40 / Fundamental 30 / Flow 30). Bobot di bawah adalah bobot
// LensIntraday sendiri, atas komponen yang sama sekali berbeda (mikrostruktur
// intraday), dan mengubahnya TIDAK mengubah apa pun di produksi.
//
// Horizon LensIntraday diukur dalam MENIT pada hari bursa yang sama. Hasil T+20
// tidak pernah boleh dipakai sebagai bukti keberhasilan intraday, dan sebaliknya.
//
// v0.2.0 TIDAK "mengikuti" LensScore v1.6 - horizon dan data mentahnya berbeda total
// (bar 5 menit dalam satu sesi vs harga harian), jadi ADX/Bollinger/Stochastic/OBV
// versi harian v1.6 tidak bisa dipasang apa adanya. Yang ditambahkan di sini adalah
// PADANAN bar-5-menit dari dua di antaranya yang benar-benar menambah dimensi baru
// (bukan duplikat trendPersistence/rangePosition yang sudah ada): obvAccumulation dan
// bollingerPctB. Lihat catatan versi di bawah.

export const LENS_INTRADAY_MODEL_NAME = 'LensIntraday' as const;
export const LENS_INTRADAY_MODEL_KEY = 'lens_intraday' as const;
// v0.1.1: slippage sisi jual memakai harga exit (bukan harga entry) dan TP/SL
// menghormati gap pada open candle. Hasil v0.1.0 tetap tersimpan terpisah di DB.
//
// v0.2.0: tambah dua komponen skor - obvAccumulation (OBV standar dinormalisasi
// terhadap volume sesi) dan bollingerPctB (%B Bollinger atas 12 bar/60 menit
// terakhir, K=2). Lima komponen lama TIDAK berubah nilainya. Rentang pemetaan kedua
// komponen baru diukur dari sebaran fitur MENTAH lewat
// scripts/calibrate-intraday-v02-components.mjs (26.606 titik grid nyata, 60 emiten
// universe riset default, lookback maksimum provider) - BUKAN dari hasil return, lihat
// catatan di IntradayComponentMapping. Hasil v0.1.x tetap tersimpan terpisah di DB
// lewat kunci (model_version, config_hash).
export const LENS_INTRADAY_MODEL_VERSION = 'lens-intraday-v0.2.0' as const;

/** Status awal. Sengaja bukan enum bebas - lihat IntradayModelStatus di bawah. */
export const LENS_INTRADAY_INITIAL_STATUS = 'RESEARCH_ONLY' as const;

export const INTRADAY_TIMEZONE = 'Asia/Jakarta' as const;
/** WIB = UTC+7 tetap sepanjang tahun (tidak ada DST di Indonesia). */
export const WIB_OFFSET_SECONDS = 7 * 60 * 60;

export const INTRADAY_DISCLAIMER =
  'LensIntraday adalah model RISET intraday yang berdiri sendiri. Skornya BUKAN persentase peluang menang, ' +
  'BUKAN rekomendasi beli/jual, dan hasilnya TIDAK boleh dicampur dengan validasi LensScore T+20.';

/**
 * Status yang boleh tampil di UI. `PRODUCTION_VALIDATED` sengaja TIDAK ada di union
 * ini - satu-satunya cara memunculkannya adalah menambah anggota baru secara sadar,
 * bukan karena sebuah backtest kebetulan terlihat untung.
 */
export type IntradayModelStatus =
  | 'DATA_NOT_READY'
  | 'COLLECTING_DATA'
  | 'WAITING_FOR_MATURITY'
  | 'INSUFFICIENT_SAMPLE'
  | 'INCONCLUSIVE'
  | 'RESEARCH_ONLY'
  | 'VALIDATION_FAILED'
  | 'CANDIDATE_VALIDATED';

export const INTRADAY_MODEL_STATUSES: readonly IntradayModelStatus[] = [
  'DATA_NOT_READY',
  'COLLECTING_DATA',
  'WAITING_FOR_MATURITY',
  'INSUFFICIENT_SAMPLE',
  'INCONCLUSIVE',
  'RESEARCH_ONLY',
  'VALIDATION_FAILED',
  'CANDIDATE_VALIDATED',
] as const;

// ---------------------------------------------------------------------------
// Horizon
// ---------------------------------------------------------------------------

export type IntradayHorizon = 'H15' | 'H30' | 'H60' | 'EOD';

export const INTRADAY_HORIZONS: readonly IntradayHorizon[] = ['H15', 'H30', 'H60', 'EOD'] as const;

/** null = tutup di akhir hari bursa yang sama, bukan setelah N menit. */
export const INTRADAY_HORIZON_MINUTES: Record<IntradayHorizon, number | null> = {
  H15: 15,
  H30: 30,
  H60: 60,
  EOD: null,
};

export const INTRADAY_HORIZON_LABEL: Record<IntradayHorizon, string> = {
  H15: 'T+15 menit',
  H30: 'T+30 menit',
  H60: 'T+60 menit',
  EOD: 'Tutup hari yang sama (EOD)',
};

// ---------------------------------------------------------------------------
// Kalender & jam bursa - CONFIGURABLE, bukan hardcode tersebar
// ---------------------------------------------------------------------------

export interface IntradaySessionWindow {
  /** Menit sejak tengah malam WIB, inklusif. */
  startMinute: number;
  /** Menit sejak tengah malam WIB, eksklusif. */
  endMinute: number;
}

export interface IntradayCalendarConfig {
  timezone: typeof INTRADAY_TIMEZONE;
  /** Senin-Kamis. */
  regularSessions: IntradaySessionWindow[];
  /** Jumat punya jam berbeda di IDX. */
  fridaySessions: IntradaySessionWindow[];
  /**
   * Menit WIB tempat sinyal riset dibangkitkan. Grid TETAP dan sama untuk semua
   * emiten/semua hari - populasi sinyal jadi tidak terseleksi oleh skor, sehingga
   * analisis bucket tidak bias ke atas.
   */
  signalGridMinutes: number[];
  /**
   * Batas exit EOD. Default 15:45 WIB = bar reguler kontinu terakhir dari provider.
   * Bar lelang penutupan 16:00 SENGAJA di luar batas: exit market order pukul 15:45
   * adalah exit intraday yang realistis, sedangkan harga lelang penutupan baru
   * terbentuk setelah order tidak bisa ditarik lagi.
   */
  eodExitCutoffMinute: number;
  /** Hari libur bursa tambahan (YYYY-MM-DD WIB) di luar Sabtu/Minggu. */
  exchangeHolidays: string[];
}

const MIN = (h: number, m = 0) => h * 60 + m;

export const DEFAULT_INTRADAY_CALENDAR: IntradayCalendarConfig = {
  timezone: INTRADAY_TIMEZONE,
  // Sesi I 09:00-12:00, Sesi II 13:30-15:50 (Pasar Reguler IDX Senin-Kamis).
  regularSessions: [
    { startMinute: MIN(9, 0), endMinute: MIN(12, 0) },
    { startMinute: MIN(13, 30), endMinute: MIN(15, 50) },
  ],
  // Jumat: Sesi I 09:00-11:30, Sesi II 14:00-15:50.
  fridaySessions: [
    { startMinute: MIN(9, 0), endMinute: MIN(11, 30) },
    { startMinute: MIN(14, 0), endMinute: MIN(15, 50) },
  ],
  signalGridMinutes: [
    MIN(9, 30),
    MIN(10, 0),
    MIN(10, 30),
    MIN(11, 0),
    MIN(13, 30),
    MIN(14, 0),
    MIN(14, 30),
    MIN(15, 0),
  ],
  eodExitCutoffMinute: MIN(15, 45),
  // Kosong = belum ada daftar libur bursa ter-commit. Hari libur weekday akan
  // terlihat sebagai "hari tanpa bar" oleh pemeriksaan kelengkapan, BUKAN diam-diam
  // dianggap hari bursa yang datanya hilang.
  exchangeHolidays: [],
};

// ---------------------------------------------------------------------------
// Provider & interval candle
// ---------------------------------------------------------------------------

export const INTRADAY_PROVIDER = 'yahoo-chart-v8' as const;
export const INTRADAY_BAR_INTERVAL = '5m' as const;
export const INTRADAY_BAR_INTERVAL_MINUTES = 5;
/** Batas keras provider untuk interval 5m. Diverifikasi empiris 2026-08-15. */
export const INTRADAY_MAX_LOOKBACK_DAYS = 60;

// ---------------------------------------------------------------------------
// Biaya transaksi & slippage - versioned
// ---------------------------------------------------------------------------

export interface IntradayCostConfig {
  version: string;
  label: string;
  /** Persen dari nilai transaksi beli (fee broker + levy). */
  buyFeePct: number;
  /** Persen dari nilai transaksi jual (fee broker + levy + PPh final 0,1%). */
  sellFeePct: number;
  /** Basis point terhadap harga entry (harga eksekusi lebih buruk dari harga bar). */
  slippageEntryBps: number;
  slippageExitBps: number;
}

/**
 * Skenario NORMAL adalah acuan utama. Angka fee mengikuti struktur ritel IDX yang
 * lazim (beli ~0,15%, jual ~0,25% sudah termasuk PPh final 0,1%); ia CONFIGURABLE
 * dan diberi versi karena broker berbeda memungut berbeda - bukan konstanta yang
 * boleh dianggap universal.
 *
 * CATATAN PENTING soal angka slippage di bawah: untuk SEBAGIAN BESAR saham IDX,
 * angka-angka ini TIDAK akan terpakai apa adanya. Lantai setengah fraksi harga
 * (lihat minHalfSpreadBps) hampir selalu lebih besar - pada Rp 6.425 saja lantainya
 * sudah ~19,5 bps, hampir dua kali asumsi 10 bps; pada Rp 174 ia ~28,7 bps. Angka
 * di sini baru menjadi penentu pada saham berharga sangat tinggi. Ia sengaja TIDAK
 * dinaikkan supaya tidak menghitung ganda dengan lantai tersebut.
 */
export const INTRADAY_COST_SCENARIOS: Record<string, IntradayCostConfig> = {
  NORMAL: {
    version: 'cost-v1-normal',
    label: 'Biaya normal (slippage 10 bps/sisi)',
    buyFeePct: 0.15,
    sellFeePct: 0.25,
    slippageEntryBps: 10,
    slippageExitBps: 10,
  },
  LOW_SLIPPAGE: {
    version: 'cost-v1-low',
    label: 'Slippage rendah (5 bps/sisi)',
    buyFeePct: 0.15,
    sellFeePct: 0.25,
    slippageEntryBps: 5,
    slippageExitBps: 5,
  },
  MEDIUM_SLIPPAGE: {
    version: 'cost-v1-medium',
    label: 'Slippage sedang (20 bps/sisi)',
    buyFeePct: 0.15,
    sellFeePct: 0.25,
    slippageEntryBps: 20,
    slippageExitBps: 20,
  },
  HIGH_SLIPPAGE: {
    version: 'cost-v1-high',
    label: 'Slippage tinggi (40 bps/sisi)',
    buyFeePct: 0.15,
    sellFeePct: 0.25,
    slippageEntryBps: 40,
    slippageExitBps: 40,
  },
  WIDE_SPREAD: {
    version: 'cost-v1-wide-spread',
    label: 'Spread melebar (75 bps/sisi)',
    buyFeePct: 0.15,
    sellFeePct: 0.25,
    slippageEntryBps: 75,
    slippageExitBps: 75,
  },
};

export const DEFAULT_INTRADAY_COST = INTRADAY_COST_SCENARIOS.NORMAL!;

// ---------------------------------------------------------------------------
// Fraksi harga IDX -> lantai spread
// ---------------------------------------------------------------------------

/**
 * Fraksi harga (tick size) Pasar Reguler IDX per kelompok harga.
 *
 * Provider tidak menyediakan bid-ask spread, jadi spread SEJATINYA tidak diketahui.
 * Yang diketahui pasti adalah BATAS BAWAHNYA: harga hanya bisa bergerak dalam
 * kelipatan fraksi, sehingga spread terbaik yang mungkin adalah satu tick, dan
 * biaya menyeberanginya setengah tick per sisi.
 *
 * Tanpa lantai ini, slippage datar 10 bps sangat optimistis untuk saham murah:
 * pada harga Rp 174 satu tick Rp 1 sudah 57 bps, jadi setengah tick saja ~29 bps -
 * hampir tiga kali asumsi datarnya. Justru saham murah yang paling sering terlihat
 * "untung" di backtest intraday, dan justru di sanalah asumsi biayanya paling salah.
 *
 * DIVERIFIKASI EMPIRIS 2026-08-15 dari bar 5 menit nyata (GCD selisih harga unik):
 *   BUMI 174-194 -> 1 | DEWA/KAEF/BULL 410-496 -> 2 | ELSA/KLBF/PGAS 660-1525 -> 5
 *   ANTM/BBRI 2970-3220 -> 10 | BBCA/INDF/UNTR/ITMG/GGRM 6200-24450 -> 25
 *   ASII 4760-5100 -> GCD 5, konsisten dengan MELINTASI batas Rp 5.000 (10 lalu 25),
 *   bukan bantahan terhadap tabel ini.
 *
 * Bisa ditimpa lewat konfigurasi kalau IDX mengubah kelompok harga.
 */
export interface IdxPriceFractionBand {
  /** Berlaku untuk harga < nilai ini. */
  maxPriceExclusive: number;
  tickIdr: number;
}

export const IDX_PRICE_FRACTIONS: IdxPriceFractionBand[] = [
  { maxPriceExclusive: 200, tickIdr: 1 },
  { maxPriceExclusive: 500, tickIdr: 2 },
  { maxPriceExclusive: 2000, tickIdr: 5 },
  { maxPriceExclusive: 5000, tickIdr: 10 },
  { maxPriceExclusive: Number.POSITIVE_INFINITY, tickIdr: 25 },
];

export function idxPriceFraction(
  price: number,
  bands: IdxPriceFractionBand[] = IDX_PRICE_FRACTIONS
): number {
  for (const band of bands) {
    if (price < band.maxPriceExclusive) return band.tickIdr;
  }
  return bands[bands.length - 1]!.tickIdr;
}

/**
 * Batas BAWAH biaya menyeberangi spread, dalam basis point: setengah tick / harga.
 * Ini bukan estimasi spread sesungguhnya - spread nyata bisa jauh lebih lebar.
 * Namanya "lantai" karena ia tidak mungkin lebih kecil dari ini.
 */
export function minHalfSpreadBps(
  price: number,
  bands: IdxPriceFractionBand[] = IDX_PRICE_FRACTIONS
): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return ((idxPriceFraction(price, bands) / 2) / price) * 10_000;
}

/** Slippage yang benar-benar dipakai: asumsi konfigurasi, tapi tidak boleh di bawah lantai tick. */
export function effectiveSlippageBps(
  price: number,
  configuredBps: number,
  bands: IdxPriceFractionBand[] = IDX_PRICE_FRACTIONS
): number {
  return Math.max(configuredBps, minHalfSpreadBps(price, bands));
}

// ---------------------------------------------------------------------------
// Kelayakan transaksi intraday
// ---------------------------------------------------------------------------

/**
 * Grid sinyal SENGAJA tidak terseleksi supaya bucket skor rendah punya pembanding.
 * Konsekuensinya: populasi itu memuat sinyal yang aplikasi sungguhan tidak akan
 * pernah tawarkan - saham gocap, atau saham yang pada jam itu nyaris tidak
 * bertransaksi. Gerbang di bawah TIDAK membuang sinyal apa pun dari populasi; ia
 * hanya MENANDAI, supaya hasil bisa dibaca dua kali: seluruh grid, dan irisan yang
 * benar-benar bisa dieksekusi.
 */
export interface IntradayTradabilityRule {
  minEntryPriceIdr: number;
  /** Nilai transaksi kumulatif sesi berjalan sampai signal_timestamp. */
  minSessionTurnoverIdr: number;
  /** Bar bervolume > 0 sampai signal_timestamp - proksi frekuensi transaksi. */
  minActiveBars: number;
}

export const DEFAULT_INTRADAY_TRADABILITY: IntradayTradabilityRule = {
  // Saham gocap: harga tidak bisa turun lagi, jadi distribusi return-nya terpotong
  // dan tidak sebanding dengan saham lain.
  minEntryPriceIdr: 51,
  // Versi intraday dari lantai ADV20 Rp 1 miliar/hari yang sudah dipakai gerbang
  // kelayakan produksi - sekitar separuh hari bursa berlalu di titik grid tengah.
  minSessionTurnoverIdr: 500_000_000,
  minActiveBars: 6,
};

export function isIntradayTradable(
  input: { entryPriceIdr: number | null; sessionTurnoverIdr: number; activeBars: number },
  rule: IntradayTradabilityRule = DEFAULT_INTRADAY_TRADABILITY
): boolean {
  if (input.entryPriceIdr == null || !Number.isFinite(input.entryPriceIdr)) return false;
  return (
    input.entryPriceIdr >= rule.minEntryPriceIdr &&
    input.sessionTurnoverIdr >= rule.minSessionTurnoverIdr &&
    input.activeBars >= rule.minActiveBars
  );
}

// ---------------------------------------------------------------------------
// Bobot LensIntraday - TERPISAH dari bobot produksi
// ---------------------------------------------------------------------------

export interface IntradayWeights {
  /** Momentum harga 30 menit terakhir - lebih pendek di titik grid paling pagi, lihat fullLookback. */
  momentum: number;
  /** Posisi harga terhadap VWAP sesi berjalan. */
  vwapDeviation: number;
  /** Lonjakan volume 3 bar terakhir terhadap rata-rata sesi berjalan. */
  volumeSurge: number;
  /** Posisi harga di dalam rentang high-low sesi berjalan. */
  rangePosition: number;
  /** Konsistensi arah 12 bar terakhir - lebih pendek di titik grid paling pagi, lihat fullLookback. */
  trendPersistence: number;
  /**
   * v0.2.0. OBV standar (unchanged close = kontribusi nol, BUKAN setengah - beda
   * sengaja dari trendPersistence) dalam sesi, dinormalisasi terhadap total volume
   * sesi supaya sebanding lintas emiten. Beda dari volumeSurge: ini mengukur ARAH
   * volume (naik vs turun), volumeSurge cuma mengukur BESARANNYA.
   */
  obvAccumulation: number;
  /**
   * v0.2.0. %B Bollinger atas 12 bar/60 menit terakhir (K=2 deviasi standar) - lihat
   * bollingerWindowBars/bollingerK di IntradayComponentMapping. Beda dari
   * rangePosition: itu statis terhadap high-low SELURUH sesi berjalan, ini dinamis
   * terhadap rata-rata bergerak jendela pendek.
   */
  bollingerPctB: number;
}

/**
 * Jendela yang DINIATKAN untuk momentum dan trendPersistence, dalam bar 5 menit.
 * Di titik grid paling pagi belum ada cukup bar sejak pembukaan, jadi jendela yang
 * benar-benar terpakai bisa lebih pendek - lihat intradayLookbackCoverage() dan field
 * fullLookback pada snapshot komponen.
 */
export const MOMENTUM_DOC_BARS = 6; // 30 menit
export const TREND_DOC_BARS = 12; // 60 menit

export const INTRADAY_COMPONENT_KEYS: readonly (keyof IntradayWeights)[] = [
  'momentum',
  'vwapDeviation',
  'volumeSurge',
  'rangePosition',
  'trendPersistence',
  'obvAccumulation',
  'bollingerPctB',
] as const;

/**
 * Semuanya mikrostruktur intraday. TIDAK ADA komponen fundamental jangka panjang di
 * sini: PER/PBV/ROE tidak berubah dalam 15 menit, jadi memasukkannya hanya akan
 * menambah konstanta per emiten yang menyamar sebagai sinyal.
 *
 * obvAccumulation dan bollingerPctB (v0.2.0) sengaja diberi bobot awal KECIL, di
 * ujung bawah INTRADAY_WEIGHT_BOUNDS. Lima bobot lama TIDAK diturunkan - totalnya
 * jadi 120, dan intradayScoreFromComponents() menormalisasi otomatis lewat
 * totalWeight, jadi ini murni mengencerkan proporsi lima komponen lama, bukan
 * mengklaim dua komponen baru ini sudah terbukti setara pentingnya. Kalau OOS nanti
 * menunjukkan keduanya tidak menambah apa pun, bobotnya turun ke nol - bukan dihapus
 * diam-diam, supaya riwayatnya tetap terlihat.
 */
export const LENS_INTRADAY_WEIGHTS: IntradayWeights = {
  momentum: 30,
  vwapDeviation: 20,
  volumeSurge: 20,
  rangePosition: 15,
  trendPersistence: 15,
  obvAccumulation: 10,
  bollingerPctB: 10,
};

/** Batas bobot untuk optimizer - mencegah usulan yang menaruh 100% di satu komponen. */
export const INTRADAY_WEIGHT_BOUNDS = { min: 5, max: 45 } as const;

// ---------------------------------------------------------------------------
// Pemetaan komponen mentah -> skala 0-100
// ---------------------------------------------------------------------------

/**
 * Rentang pemetaan tiap komponen. Sebelumnya angka-angka ini terkubur sebagai literal
 * di dalam computeIntradayComponents(), sehingga: (a) tidak ikut config_hash, jadi
 * mengubahnya tidak menghasilkan protokol OOS baru - persis celah "diedit diam-diam
 * setelah freeze" yang modul ini klaim tutup; dan (b) tidak bisa diperiksa.
 *
 * PENTING - kenapa angka ini TIDAK boleh disetel dari hasil:
 * Rentang ini adalah prior tentang besaran gerakan wajar 5-30 menit saham IDX. Ia
 * menyangkut SEBARAN FITUR, bukan hubungan fitur dengan keuntungan. Menyetelnya
 * sampai win rate membaik adalah fitting, dan hasil apa pun setelah itu tidak berarti.
 *
 * Yang SAH dilakukan adalah memeriksa apakah rentangnya masuk akal terhadap sebaran
 * fitur itu sendiri - lihat diagnostik saturasi di intraday-validation.service, yang
 * hanya membaca komponen dan TIDAK PERNAH menyentuh net return.
 */
export interface IntradayComponentMapping {
  /** Return 30 menit yang dipetakan ke ujung skala. */
  momentumAbs: number;
  /** Deviasi terhadap VWAP sesi yang dipetakan ke ujung skala. */
  vwapDeviationAbs: number;
  /**
   * Rasio lonjakan volume yang dianggap NETRAL - titik tengah skala 0-100.
   *
   * DULU tidak ada, dan skalanya diasumsikan berpusat di 1,0 dengan alasan "volume
   * normal". Diukur dari 26.606 sinyal (60 emiten, 57 hari bursa, 2 Juni - 21 Agustus
   * 2026), asumsi itu salah: median rasio ini 0,7169, dan 1,0 justru berada di
   * persentil 67,7. Akibatnya observasi MEDIAN mendapat skor ~41, bukan 50 - bias turun
   * sistematis yang menular ke setiap skor.
   *
   * Sebabnya struktural, bukan kebetulan: penyebut rasio ini adalah rata-rata volume
   * sesi berjalan yang SUDAH memuat bar pembukaan yang berat, jadi volume 3 bar terakhir
   * memang lazim berada di bawahnya sepanjang hari.
   *
   * Angka 0,72 adalah median empiris dibulatkan. Ia menyangkut SEBARAN FITUR, bukan
   * hubungan fitur dengan keuntungan - tidak satu pun net return dilihat saat memilihnya.
   */
  volumeSurgeCenter: number;
  /**
   * Setengah lebar skala dalam kelipatan, relatif terhadap `volumeSurgeCenter`.
   *
   * 2,5 membuat 26,05% observasi mentok di ujung skala (23,25% di bawah, 2,80% di atas) -
   * di atas ambang MAX_HEALTHY_COMPONENT_SATURATION, dan komponen yang mentok kehilangan
   * daya bedanya. 3,5 dipilih karena setara persentil ke-90 dari |log(surge / pusat)|
   * pada sebaran yang sama (3,466), dan menurunkan saturasi ke 9,76% (7,01% / 2,75%).
   */
  volumeSurgeSpan: number;
  /**
   * v0.2.0. Return 30 menit OBV dipetakan linear (-Abs..+Abs) ke 0-100, simetris
   * di 0 seperti momentum/vwapDeviation (OBV bertanda dan sudah dinormalisasi
   * terhadap volume sesi, jadi tidak butuh titik pusat seperti volumeSurge).
   *
   * DIUKUR EMPIRIS lewat scripts/calibrate-intraday-v02-components.mjs: 26.606 titik
   * grid (60 emiten universe riset default, lookback maksimum provider 60 hari).
   * Median -0,009 (praktis 0, sesuai ekspektasi ukuran bertanda). p90=0,3505 (saturasi
   * 22,15%), p95=0,4587 (saturasi 11,31%). Dipilih 0,46 (~p95) supaya saturasinya
   * sepadan dengan volumeSurgeSpan (9,76%) - bukan angka bulat tebakan.
   */
  obvAccumulationAbs: number;
  /** v0.2.0. Jumlah bar 5-menit untuk mean/stdev %B Bollinger. Sama dengan TREND_DOC_BARS (60 menit) - konsisten skala dengan trendPersistence. */
  bollingerWindowBars: number;
  /** v0.2.0. Lebar pita Bollinger dalam kelipatan deviasi standar. */
  bollingerK: number;
}

export const DEFAULT_INTRADAY_COMPONENT_MAPPING: IntradayComponentMapping = {
  momentumAbs: 0.015,
  vwapDeviationAbs: 0.01,
  volumeSurgeCenter: 0.72,
  volumeSurgeSpan: 3.5,
  obvAccumulationAbs: 0.46,
  bollingerWindowBars: 12,
  bollingerK: 2,
};

/**
 * Di atas porsi ini, sebuah komponen terlalu sering mentok di 0 atau 100 - artinya
 * rentang pemetaannya terlalu sempit dan komponen itu kehilangan daya bedanya.
 * Ambang diagnostik, BUKAN gerbang penerimaan.
 */
export const MAX_HEALTHY_COMPONENT_SATURATION = 0.25;

// ---------------------------------------------------------------------------
// Bucket skor
// ---------------------------------------------------------------------------

export const INTRADAY_SCORE_BUCKETS = [
  { key: '<40', low: Number.NEGATIVE_INFINITY, high: 40 },
  { key: '40-49', low: 40, high: 50 },
  { key: '50-59', low: 50, high: 60 },
  { key: '60-69', low: 60, high: 70 },
  { key: '70-79', low: 70, high: 80 },
  { key: '80-100', low: 80, high: Number.POSITIVE_INFINITY },
] as const;

export type IntradayScoreBucket = (typeof INTRADAY_SCORE_BUCKETS)[number]['key'];

export function intradayScoreBucket(score: number): IntradayScoreBucket {
  for (const bucket of INTRADAY_SCORE_BUCKETS) {
    if (score >= bucket.low && score < bucket.high) return bucket.key;
  }
  return '<40';
}

// ---------------------------------------------------------------------------
// Ambang sampel minimum
// ---------------------------------------------------------------------------

/** Di bawah ini bucket/horizon dilabeli INSUFFICIENT_SAMPLE - TETAP DITAMPILKAN. */
export const MIN_EFFECTIVE_SAMPLE_PER_CELL = 30;
export const MIN_EFFECTIVE_SAMPLE_TOTAL = 500;
export const MIN_OOS_TRADING_DAYS = 60;
export const MIN_DISTINCT_TICKERS = 30;
/** Kelengkapan bar minimum sebelum validation run boleh jalan sama sekali. */
export const MIN_DATA_COMPLETENESS_PCT = 90;
export const VALIDATION_ALPHA = 0.05;

// ---------------------------------------------------------------------------
// Config hash
// ---------------------------------------------------------------------------

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** FNV-1a 32-bit. Sama algoritmanya dengan datasetHash di robust-validation.service. */
export function fnv1aHex(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface IntradayRunConfig {
  modelVersion: string;
  weights: IntradayWeights;
  /** Ikut config_hash - mengubah pemetaan = protokol OOS baru, bukan edit diam-diam. */
  componentMapping: IntradayComponentMapping;
  calendar: IntradayCalendarConfig;
  cost: IntradayCostConfig;
  /** Ikut config_hash: lantai spread mengubah net return, jadi ia bagian dari model biaya. */
  priceFractions: IdxPriceFractionBand[];
  tradability: IntradayTradabilityRule;
  interval: string;
  provider: string;
  /** Bar ke-berapa setelah bar sinyal yang dipakai entry. 1 = bar berikutnya. */
  entryLagBars: number;
  /** null = tidak ada TP/SL, exit murni per horizon. */
  takeProfitPct: number | null;
  stopLossPct: number | null;
  scoreThreshold: number | null;
}

export function defaultIntradayRunConfig(
  overrides: Partial<IntradayRunConfig> = {}
): IntradayRunConfig {
  return {
    modelVersion: LENS_INTRADAY_MODEL_VERSION,
    weights: LENS_INTRADAY_WEIGHTS,
    componentMapping: DEFAULT_INTRADAY_COMPONENT_MAPPING,
    calendar: DEFAULT_INTRADAY_CALENDAR,
    cost: DEFAULT_INTRADAY_COST,
    priceFractions: IDX_PRICE_FRACTIONS,
    tradability: DEFAULT_INTRADAY_TRADABILITY,
    interval: INTRADAY_BAR_INTERVAL,
    provider: INTRADAY_PROVIDER,
    entryLagBars: 1,
    takeProfitPct: null,
    stopLossPct: null,
    scoreThreshold: null,
    ...overrides,
  };
}

/**
 * Hash konfigurasi. Dipakai untuk membuktikan bahwa protokol OOS yang dibekukan
 * benar-benar dijalankan dengan konfigurasi yang sama - kalau satu angka biaya
 * atau satu bobot berubah, hash berubah dan run tidak lagi bisa mengaku OOS.
 */
export function intradayConfigHash(config: IntradayRunConfig): string {
  return `cfg-${fnv1aHex(stableStringify(config))}`;
}

export { stableStringify as stableStringifyForHash };
