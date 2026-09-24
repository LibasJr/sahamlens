/**
 * Angka bukti untuk halaman Profil Risiko & Tren.
 *
 * Sumber: `scripts/factor-research.mjs` (npm `factor:scan`), dijalankan pada 2026-09-24 atas
 * arsip harga SahamLens sendiri. Laporan lengkap: docs/factor-research/factor-scan-2026-09-24.md
 *
 * Nilai di berkas ini adalah SALINAN angka hasil, bukan angka yang ditulis ulang agar cocok
 * dengan halaman. Ujilah dengan `modules/risk-profile/__tests__/risk-factor-evidence.test.ts`:
 * uji itu memastikan aritmetika internalnya konsisten (mis. netto = bruto − biaya) dan bahwa
 * ambang yang dipakai halaman sama dengan yang dipakai pengukuran.
 */

export const RISK_FACTOR_SAMPLE = {
  archiveStart: '2021-08-30',
  archiveEnd: '2026-09-24',
  sessions: 1227,
  tickers: 915,
  observations: 285_360,
  minimumRowsPerTicker: 300,
  minimumLiquidityIdr: 1_000_000_000,
  forwardSessions: 20,
  rebalanceSessions: 20,
  /** Biaya transaksi bolak-balik yang dipakai pengukuran portofolio. */
  roundTripCost: 0.004,
  costStress: 0.006,
  trainEnd: '2024-12-31',
  oosStart: '2025-01-01',
  topQuantile: 0.1,
  scanDate: '2026-09-24',
} as const;

export interface RiskFactorEvidence {
  id: string;
  label: string;
  /** IC = korelasi peringkat lintas-emiten antara ciri dan imbal hasil 20 sesi ke depan. */
  icTrain: number;
  icOos: number;
  icOosNonOverlap: number;
  tOos: number;
  positiveDateShareOos: number;
  /** Selisih rata-rata imbal hasil 20 sesi antara desil teratas dan terbawah. */
  decileSpread: number;
  portfolioNetMean: number;
  portfolioTotal: number;
  portfolioMaxDrawdown: number;
  portfolioOosMean: number;
  /** Benar bila IC positif di train DAN OOS — syarat untuk ikut membentuk peringkat halaman. */
  robust: boolean;
}

/**
 * Hanya faktor harga/risiko/tren yang masuk daftar ini — bukan faktor skor produksi, karena
 * cakupan fundamental historis hanya sebagian (coverage_pct < 100 untuk hampir semua sesi
 * 2021–2025), sehingga bukan ukuran yang sebanding lintas emiten.
 */
export const RISK_FACTOR_EVIDENCE: readonly RiskFactorEvidence[] = [
  {
    id: 'vol_60',
    label: 'Volatilitas 60 sesi rendah',
    icTrain: 0.1484,
    icOos: 0.1056,
    icOosNonOverlap: 0.11,
    tOos: 2.26,
    positiveDateShareOos: 0.651,
    decileSpread: 0.011,
    portfolioNetMean: 0.0084,
    portfolioTotal: 0.459,
    portfolioMaxDrawdown: -0.15,
    portfolioOosMean: 0.0188,
    robust: true,
  },
  {
    id: 'vol_20',
    label: 'Volatilitas 20 sesi rendah',
    icTrain: 0.133,
    icOos: 0.0935,
    icOosNonOverlap: 0.1028,
    tOos: 2.41,
    positiveDateShareOos: 0.651,
    decileSpread: 0.0034,
    portfolioNetMean: 0.0026,
    portfolioTotal: 0.098,
    portfolioMaxDrawdown: -0.199,
    portfolioOosMean: 0.0117,
    robust: true,
  },
  {
    id: 'dist_high_52w',
    label: 'Jarak dari puncak 52 minggu',
    icTrain: 0.1061,
    icOos: 0.0452,
    icOosNonOverlap: 0.0481,
    tOos: 1.37,
    positiveDateShareOos: 0.69,
    decileSpread: 0.0258,
    portfolioNetMean: 0.0331,
    portfolioTotal: 3.008,
    portfolioMaxDrawdown: -0.277,
    portfolioOosMean: 0.0565,
    robust: true,
  },
  {
    id: 'max_ret_20',
    label: 'Puncak imbal hasil harian 20 sesi (hindari lonjakan ekstrem)',
    icTrain: 0.1143,
    icOos: 0.0774,
    icOosNonOverlap: 0.081,
    tOos: 2.09,
    positiveDateShareOos: 0.636,
    decileSpread: 0.0014,
    portfolioNetMean: 0.0042,
    portfolioTotal: 0.176,
    portfolioMaxDrawdown: -0.203,
    portfolioOosMean: 0.017,
    robust: true,
  },
  {
    id: 'mom_12_1',
    label: 'Momentum 12 bulan minus 1 bulan',
    icTrain: 0.067,
    icOos: -0.0432,
    icOosNonOverlap: -0.0477,
    tOos: -1.33,
    positiveDateShareOos: 0.501,
    decileSpread: 0.0101,
    portfolioNetMean: 0.0099,
    portfolioTotal: 0.163,
    portfolioMaxDrawdown: -0.497,
    portfolioOosMean: 0.0377,
    robust: false,
  },
  {
    id: 'liquidity',
    label: 'Likuiditas (log nilai transaksi 20 hari)',
    icTrain: 0.0118,
    icOos: -0.0429,
    icOosNonOverlap: -0.0616,
    tOos: -3.11,
    positiveDateShareOos: 0.298,
    decileSpread: -0.0199,
    portfolioNetMean: 0.0021,
    portfolioTotal: -0.046,
    portfolioMaxDrawdown: -0.382,
    portfolioOosMean: 0.0165,
    robust: false,
  },
] as const;

/** Patokan: seluruh emiten likuid, timbang sama, tanpa biaya. */
export const RISK_FACTOR_BENCHMARK = {
  mean: 0.0083,
  total: 0.334,
  maxDrawdown: -0.326,
  oosMean: 0.0252,
  oosPeriods: 20,
} as const;

/**
 * Dua ciri yang membentuk peringkat di halaman. Dipilih karena punya bukti terkuat
 * (t-statistik OOS tertinggi) di antara ciri yang positif di train dan OOS.
 * `mom_12_1`, `liquidity`, dan faktor skor TIDAK dipakai karena buktinya berbalik di OOS.
 */
export const RISK_PROFILE_COMPOSITE_FACTORS = ['vol_60', 'dist_high_52w'] as const;

export const RISK_FACTOR_CAVEATS: readonly string[] = [
  'Peringkat ini menilai risiko dan posisi harga relatif, bukan arah harga. Tidak ada ramalan di dalamnya.',
  'Bukti bersifat kelompok (desil teratas vs terbawah dari ±900 emiten), bukan janji untuk satu emiten.',
  'Semua angka dihitung dari penutupan saja: arsip SahamLens belum menyimpan high/low/volume harian, jadi tidak ada ATR.',
  'Biaya 0,40% per transaksi sudah diperhitungkan pada angka portofolio di tabel bukti.',
  'Data fundamental, kepemilikan asing, dan ringkasan broker tidak dipakai karena cakupannya tidak lengkap.',
];