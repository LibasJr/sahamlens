// PENGGANDA WAJAR TURUNAN TEORI (Gordon / residual income)
//
// Menutup temuan P1-12 & sebagian P1-10 (review kuantitatif 2026-08-05).
//
// MASALAH YANG DIPERBAIKI. Nilai wajar di aplikasi ini sebelumnya diturunkan dari
// konstanta yang tidak berasal dari mana pun:
//
//     pbvWajar = (roe / 12) * 0.85       // non-bank
//     pbvWajar = (roe / 12) * 1.4        // bank
//     perWajar = 15                      // semua emiten
//     discountRate = 12%                 // semua emiten, tanpa penyesuaian risiko
//
// Bentuk yang benar sudah dikenal luas dan diturunkan dari model Gordon:
//
//     PBV* = (ROE - g) / (r - g)
//     PER* = payout * (1 + g) / (r - g)
//
// Selisihnya besar dan sistematis, bukan pembulatan. Untuk ROE 20%, g 5%, r 12%:
// rumus lama memberi PBV wajar 1,42x sementara bentuk Gordon memberi 2,14x - selisih 50%
// pada angka yang langsung menentukan label UNDERVALUED/OVERVALUED.
//
// Yang sama pentingnya: `r` (cost of equity) sekarang PER EMITEN, bukan 12% untuk semua.
//     r = yield SBN 10Y + beta * equity risk premium
// `beta.service.ts` sudah ada dan berfungsi sejak lama, tapi tidak pernah dipakai untuk
// valuasi. Sekarang dipakai. Emiten dengan beta 1,5 menghadapi tingkat diskonto lebih
// tinggi - artinya nilai wajarnya lebih rendah - dan itu memang seharusnya begitu.
//
// BATAS KEJUJURAN: SBN 10Y & ERP di bawah tetap ASUMSI STATIS (aplikasi ini tidak
// tersambung ke sumber data yield SBN). Yang berubah adalah bentuk rumusnya menjadi
// benar dan sensitivitasnya terhadap risiko emiten menjadi nyata, bukan bahwa asumsi
// makronya berubah menjadi data pasar.

/** Asumsi makro Indonesia. TETAP asumsi statis - lihat catatan di atas. */
export const MACRO_ASSUMPTIONS = {
  /** Yield SBN 10 tahun sebagai proxy risk-free rate, persen. */
  RISK_FREE_RATE_PCT: 6.7,
  /** Equity risk premium pasar Indonesia, persen. */
  EQUITY_RISK_PREMIUM_PCT: 5.2,
  /** Kapan kedua angka di atas terakhir ditinjau manusia. */
  SET_ON: '2026-08-03',
  /** Batas atas pertumbuhan perpetuitas. Pertumbuhan abadi di atas pertumbuhan PDB
   * nominal jangka panjang secara matematis berarti emiten itu akhirnya menjadi
   * seluruh perekonomian - batas ini mencegah nilai wajar meledak lewat penyebut
   * (r - g) yang menyusut. */
  MAX_PERPETUAL_GROWTH_PCT: 5,
} as const;

/** Batas bawah selisih (r - g). Tanpa ini, emiten dengan g mendekati r menghasilkan
 * pengganda ratusan kali - bukan temuan valuasi, melainkan pembagian dengan angka
 * mendekati nol. */
const MIN_SPREAD = 0.02;

export interface CostOfEquityInput {
  /** Beta terhadap IHSG. `null` = tidak bisa dihitung (histori kurang / benchmark
   * tidak tersedia) - pemanggil WAJIB memasok `fallbackBeta` dari profil sektor,
   * dan hasilnya ditandai `betaSource: 'sector-default'`. */
  beta: number | null;
  fallbackBeta: number;
}

export interface CostOfEquityResult {
  /** Desimal, mis. 0.119 untuk 11,9%. */
  rate: number;
  betaUsed: number;
  betaSource: 'emiten' | 'sector-default';
}

/**
 * Cost of equity ala CAPM: r = Rf + beta x ERP.
 *
 * Beta di-clamp ke 0,4-2,0. Beta di luar rentang itu untuk saham IDX hampir selalu
 * artefak likuiditas (saham jarang bertransaksi menghasilkan beta mendekati 0; saham
 * gorengan menghasilkan beta ekstrem), bukan pengukuran risiko sistematis yang bermakna.
 */
export function costOfEquity({ beta, fallbackBeta }: CostOfEquityInput): CostOfEquityResult {
  const usable = beta != null && Number.isFinite(beta);
  const raw = usable ? (beta as number) : fallbackBeta;
  const betaUsed = Math.min(2.0, Math.max(0.4, raw));
  const rate =
    (MACRO_ASSUMPTIONS.RISK_FREE_RATE_PCT + betaUsed * MACRO_ASSUMPTIONS.EQUITY_RISK_PREMIUM_PCT) / 100;
  return { rate, betaUsed, betaSource: usable ? 'emiten' : 'sector-default' };
}

/**
 * Pertumbuhan berkelanjutan = ROE x rasio laba ditahan, dibatasi `MAX_PERPETUAL_GROWTH_PCT`.
 *
 * Ini pertumbuhan yang bisa dibiayai emiten dari labanya sendiri tanpa menambah utang
 * atau menerbitkan saham baru - bukan proyeksi analis, bukan tebakan.
 *
 * @param roePct ROE dalam persen (mis. 18.2)
 * @param payoutRatio rasio pembayaran dividen 0-1. `null` -> pakai asumsi retensi 60%
 *        (dinyatakan, bukan disembunyikan).
 */
export function sustainableGrowth(roePct: number | null, payoutRatio: number | null): number {
  if (roePct == null || !Number.isFinite(roePct) || roePct <= 0) return 0;
  const retention =
    payoutRatio != null && Number.isFinite(payoutRatio)
      ? Math.min(1, Math.max(0, 1 - payoutRatio))
      : 0.6;
  const g = (roePct / 100) * retention;
  return Math.min(MACRO_ASSUMPTIONS.MAX_PERPETUAL_GROWTH_PCT / 100, Math.max(0, g));
}

export interface ImpliedMultiples {
  /** PBV yang dibenarkan oleh ROE & risiko emiten. `null` kalau ROE tidak tersedia. */
  fairPbv: number | null;
  /** PER yang dibenarkan model. Lihat `fairPerBasis` untuk tahu model mana yang dipakai. */
  fairPer: number | null;
  /** `'gordon'` = memperhitungkan pertumbuhan (butuh ROE). `'no-growth'` = perpetuitas
   * tanpa pertumbuhan (1/r), dipakai saat ROE tidak tersedia - angka bersyarat yang
   * WAJIB dinyatakan sebagai bersyarat ke pengguna, bukan disajikan setara. */
  fairPerBasis: 'gordon' | 'no-growth';
  costOfEquityPct: number;
  growthPct: number;
  betaUsed: number;
  betaSource: CostOfEquityResult['betaSource'];
}

export interface ImpliedMultiplesInput {
  roePct: number | null;
  payoutRatio: number | null;
  beta: number | null;
  fallbackBeta: number;
}

/**
 * Hitung PBV & PER wajar dari fundamental emiten itu sendiri.
 *
 *     PBV* = (ROE - g) / (r - g)                    [Gordon, bentuk residual income]
 *     PER* = payout_implied x (1 + g) / (r - g)
 *     payout_implied = 1 - g / ROE
 *
 * KENAPA `payout_implied`, BUKAN payout yang diamati. Karena `g` dibatasi
 * `MAX_PERPETUAL_GROWTH_PCT`, memakai rasio pembayaran yang diamati membuat modelnya
 * TIDAK KONSISTEN DENGAN DIRINYA SENDIRI: emiten ROE 22% dengan retensi 60% "seharusnya"
 * tumbuh 13,2%, tapi kita membatasinya ke 5% - artinya di dalam model, laba yang ditahan
 * itu tidak menghasilkan pertumbuhan sebesar yang seharusnya, dan emitennya dihukum
 * seolah menahan laba tanpa hasil. PER wajarnya jatuh ke 6x, jauh di bawah PBV wajarnya
 * yang 2,5x - dua angka dari satu model yang saling bertentangan.
 *
 * Dengan `payout_implied = 1 - g/ROE`, kedua pengganda konsisten satu sama lain (identitas
 * PBV = PER x ROE terpenuhi hampir persis), dan saat batas pertumbuhan TIDAK mengikat,
 * rumus ini menyusut kembali menjadi rasio pembayaran yang diamati - jadi tidak ada
 * asumsi tambahan yang diselundupkan.
 *
 * Kalau ROE tidak tersedia, PER wajar jatuh ke perpetuitas TANPA pertumbuhan (`1/r`) dan
 * ditandai lewat `fairPerBasis`, supaya pemanggil bisa menyatakannya ke pengguna alih-alih
 * menyajikan angka bersyarat sebagai angka penuh.
 *
 * Kalau ROE <= g, `g` dipaksa 0 sehingga PBV* = ROE / r. Pertumbuhan yang dibiayai dari
 * imbal hasil di bawah biaya modalnya MENGHANCURKAN nilai, jadi menolak memberinya premi
 * lebih benar daripada membiarkan rumus menghasilkan angka negatif yang tak bermakna.
 */
export function impliedMultiples(input: ImpliedMultiplesInput): ImpliedMultiples {
  const coe = costOfEquity({ beta: input.beta, fallbackBeta: input.fallbackBeta });
  const r = coe.rate;

  let g = sustainableGrowth(input.roePct, input.payoutRatio);
  const roeDecimal = input.roePct != null && Number.isFinite(input.roePct) ? input.roePct / 100 : null;

  // Jaga dua hal sekaligus: g tidak boleh >= ROE (nilai tidak terdefinisi), dan spread
  // (r - g) tidak boleh menyusut sampai penggandanya meledak.
  if (roeDecimal != null && g >= roeDecimal) g = 0;
  if (r - g < MIN_SPREAD) g = Math.max(0, r - MIN_SPREAD);

  const spread = Math.max(MIN_SPREAD, r - g);

  const fairPbv = roeDecimal != null && roeDecimal > 0 ? (roeDecimal - g) / spread : null;

  let fairPer: number | null;
  let fairPerBasis: ImpliedMultiples['fairPerBasis'];
  if (roeDecimal != null && roeDecimal > 0) {
    const impliedPayout = Math.min(1, Math.max(0, 1 - g / roeDecimal));
    fairPer = (impliedPayout * (1 + g)) / spread;
    fairPerBasis = 'gordon';
  } else {
    fairPer = 1 / r;
    fairPerBasis = 'no-growth';
  }

  return {
    fairPbv: fairPbv != null && Number.isFinite(fairPbv) && fairPbv > 0 ? fairPbv : null,
    fairPer: fairPer != null && Number.isFinite(fairPer) && fairPer > 0 ? fairPer : null,
    fairPerBasis,
    costOfEquityPct: r * 100,
    growthPct: g * 100,
    betaUsed: coe.betaUsed,
    betaSource: coe.betaSource,
  };
}

/**
 * Ubah rasio "pengganda wajar / pengganda aktual" menjadi skor 0-5.
 *
 * Rasio > 1 berarti emiten diperdagangkan DI BAWAH pengganda yang dibenarkan
 * fundamentalnya. Dipakai bersama oleh penilaian PER dan PBV supaya keduanya memakai
 * skala yang sama - dulu masing-masing punya pita sendiri yang tidak sebanding.
 *
 * Pita 0,90-1,05 disebut "wajar" (bukan titik tunggal 1,0) karena presisi model ini
 * tidak mendukung pembedaan 2% di sekitar nilai wajar; membuat batasnya tajam di 1,0
 * hanya menciptakan lompatan skor yang tidak berarti.
 *
 * [HIPOTESIS] Batas 1,30/1,05/0,90/0,70/0,50 belum divalidasi terhadap forward return.
 */
export function scoreMultipleRatio(ratio: number | null): number | null {
  if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) return null;
  if (ratio >= 1.3) return 5;
  if (ratio >= 1.05) return 4;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.7) return 2;
  if (ratio >= 0.5) return 1;
  return 0;
}

/**
 * Earnings yield emiten dibandingkan biaya ekuitasnya sendiri.
 *
 * `EY / r > 1` berarti laba yang dihasilkan per rupiah harga melebihi imbal hasil yang
 * dituntut atas risikonya - definisi "murah" yang punya dasar, bukan ambang PER tetap
 * yang sama untuk bank dan emiten teknologi.
 *
 * `null` kalau PER tidak tersedia atau <= 0 (emiten rugi - earnings yield negatif tidak
 * bisa dibandingkan dengan cost of equity secara bermakna, dan memaksakannya akan
 * memberi nilai "sangat mahal" yang menyesatkan untuk emiten yang sedang investasi berat).
 */
export function earningsYieldVsCostOfEquity(per: number | null, costOfEquityRate: number): number | null {
  if (per == null || !Number.isFinite(per) || per <= 0) return null;
  if (!Number.isFinite(costOfEquityRate) || costOfEquityRate <= 0) return null;
  return (1 / per) / costOfEquityRate;
}
