import YahooFinanceClass from 'yahoo-finance2';
import { getUsdIdrRate } from '../../../shared/market/usd-idr-rate';
import { impliedMultiples, MACRO_ASSUMPTIONS } from './fair-multiples.service';
import { resolveSectorProfile } from '../../sector/service/sector-classifier.service';

// BUILD 004 (AI Architecture) - dipindah verbatim dari app/api/intrinsic/[ticker]/route.ts
// supaya bisa dipakai ulang oleh Valuation Agent di modules/ai/service/orchestrator.service.ts
// tanpa endpoint itu memanggil dirinya sendiri lewat HTTP. Logika perhitungan TIDAK diubah.

// BUG FIX (audit logika & algoritma 2026-08-05, temuan H-6): konstanta cadangan
// USDIDR_STATIC_FALLBACK = 15500 dihapus dan pengambilan kurs dipindah ke
// shared/market/usd-idr-rate.ts (dipakai bersama 4 call-site lain yang dulu punya
// salinan sendiri dengan `|| 15500`). Kalau kurs benar-benar tidak tersedia, helper itu
// mengembalikan null dan metode valuasi yang bergantung padanya DILEWATI - bukan dihitung
// dengan kurs tebakan lalu ditampilkan sebagai nilai wajar.

// Metodologi valuasi - SEMUA angka di bawah adalah ASUMSI MODEL, bukan data pasar.
// Dikumpulkan di satu tempat (audit 2026-08-05, temuan H-3/H-4) supaya bisa dibaca,
// dibandingkan, dan diberi label di UI sebagai asumsi. Sebelumnya tersebar sebagai
// angka telanjang di tengah rumus (`(roe / 12) * 1.4`, `(dps * 1.05) / (0.12 - 0.05)`,
// `eps * 15`) sehingga pengguna melihat "Harga Wajar Rp X" tanpa cara tahu bahwa X
// bergantung penuh pada tebakan tetap yang sama untuk SEMUA emiten.
export const VALUATION_ASSUMPTIONS = {
  /** Tingkat diskonto ekuitas yang dipakai DDM & DCF perpetuity. Sama untuk semua emiten -
   * penyederhanaan yang disengaja karena aplikasi ini tidak punya data beta/struktur modal
   * per-emiten yang cukup andal untuk menurunkan WACC individual. */
  DISCOUNT_RATE: 0.12,
  /** Pertumbuhan perpetuitas. Ditahan di 5% (bukan 8%) supaya pembagi (r - g) tidak
   * menyusut ekstrem dan meledakkan nilai wajar saham dividen tinggi. */
  PERPETUAL_GROWTH: 0.05,
  /**
   * @deprecated TIDAK LAGI DIPAKAI MENGHITUNG APA PUN (perbaikan C-05 & H-04,
   * audit kuantitatif 2026-08-11).
   *
   * PER dan PBV wajar sekarang berasal dari impliedMultiples() di fair-multiples.service.ts
   * - model yang sama dengan komponen Valuasi LensScore. Konstanta di bawah adalah rumus
   * lama: pengali PER tetap 15x/14,5x untuk semua emiten, dan PBV heuristik
   * (ROE / pembagi) x pengali dengan tingkat diskonto 12% yang sama untuk semua.
   *
   * Dipertahankan sebagai catatan sejarah, bukan sebagai konstanta hidup: dua model nilai
   * wajar yang berjalan bersamaan untuk emiten yang sama adalah persis masalah yang
   * dihapus di sini. Kalau nilainya perlu diubah, yang benar adalah mengubah
   * MACRO_ASSUMPTIONS, bukan menghidupkan kembali angka-angka ini.
   */
  FAIR_PER_NON_BANK: 15,
  FAIR_PER_BANK: 14.5,
  BANK_PBV_DIVISOR: 12,
  BANK_PBV_MULTIPLIER: 1.4,
  BANK_HIGH_ROE_DIVISOR: 11,
  BANK_HIGH_ROE_MULTIPLIER: 1.3,
  BANK_PBV_CAP: 3.2,
  NON_BANK_PBV_DIVISOR: 12,
  NON_BANK_PBV_MULTIPLIER: 0.85,
  /** Konstanta Graham Number klasik (22.5 = 15 x 1.5). */
  GRAHAM_CONSTANT: 22.5,
} as const;

/**
 * Router METODE valuasi per sektor.
 *
 * Audit M-03: angka bobot sektoral lama (45/30/25 dst.) tidak pernah divalidasi
 * terhadap forward return. Angka itu dihapus. Sektor kini hanya menentukan metode
 * mana yang secara ekonomi relevan; metode yang benar-benar tersedia digabung
 * equal-weight. Dengan demikian tidak ada presisi palsu dari bobot hipotesis.
 */
type ValuationMethodKey = 'pbv' | 'ddm' | 'per' | 'dcf' | 'graham';
const SECTOR_METHODS: Record<string, readonly ValuationMethodKey[]> = {
  'Banks - Regional': ['pbv', 'ddm', 'per'],
  Banks: ['pbv', 'ddm', 'per'],
  'Financial Services': ['pbv', 'ddm', 'per'],
  'Consumer Defensive': ['per', 'dcf', 'ddm', 'graham'],
  'Consumer Cyclical': ['per', 'dcf', 'ddm', 'graham'],
  Energy: ['pbv', 'ddm', 'per'],
  'Basic Materials': ['pbv', 'ddm', 'per'],
  'Real Estate': ['pbv', 'per', 'ddm'],
  'Communication Services': ['dcf', 'per', 'ddm'],
  Industrials: ['per', 'dcf', 'pbv', 'ddm'],
  Healthcare: ['per', 'dcf', 'pbv', 'ddm'],
  DEFAULT: ['per', 'dcf', 'pbv', 'ddm', 'graham'],
};

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export async function calculateIntrinsicValue(rawTicker: string) {
  let ticker = rawTicker.toUpperCase();
  if (!ticker.includes('.')) {
    ticker = `${ticker}.JK`;
  }

  const quoteSummary = await yahooFinance.quoteSummary(ticker, {
    modules: ['assetProfile', 'defaultKeyStatistics', 'financialData', 'summaryDetail', 'price']
  });

  if (!quoteSummary) {
    return null;
  }

  const price = isFinitePositive(quoteSummary.price?.regularMarketPrice)
    ? quoteSummary.price.regularMarketPrice
    : null;
  if (price == null) return null;

  const eps = isFiniteNumber(quoteSummary.defaultKeyStatistics?.trailingEps)
    ? quoteSummary.defaultKeyStatistics.trailingEps
    : null;
  let bvps: number | null = isFiniteNumber(quoteSummary.defaultKeyStatistics?.bookValue)
    ? quoteSummary.defaultKeyStatistics.bookValue
    : null;
  const roe = isFiniteNumber(quoteSummary.financialData?.returnOnEquity)
    ? quoteSummary.financialData.returnOnEquity * 100
    : null;
  const dps = isFiniteNumber(quoteSummary.summaryDetail?.dividendRate)
    ? quoteSummary.summaryDetail.dividendRate
    : null;

  // Fallback FCF
  let fcf = isFiniteNumber(quoteSummary.financialData?.freeCashflow)
    ? quoteSummary.financialData.freeCashflow
    : null;
  // BUG FIX (audit integritas data 2026-08-03, temuan C-09): `|| 1` di sini berarti kalau
  // Yahoo tidak mengembalikan sharesOutstanding, FCF PER SAHAM diam-diam menjadi FCF TOTAL
  // perusahaan (bisa belasan triliun rupiah "per lembar") - nilai itu tetap > 0 sehingga
  // lolos ke intrinsic_dcf/validFairValues dan meledakkan fair_value. sharesOutstanding
  // yang hilang sekarang membuat fcf_per_share null (metode DCF dilewati), bukan angka
  // fiktif berskala triliunan.
  let shares = quoteSummary.defaultKeyStatistics?.sharesOutstanding;
  let fcf_per_share = (fcf && isFinitePositive(shares)) ? fcf / shares : null;

  // --- BUG FIX: CURRENCY MISMATCH (USD vs IDR) ---
  // Emiten seperti ERTX, ITMG, MEDC melapor dalam USD. Yahoo Finance memberikan EPS dalam USD tapi Harga dalam IDR.
  // Ini menyebabkan P/E menjadi 160.000x dan Harga Wajar (Intrinsic) hancur menjadi Rp 0.
  const priceCurrency = quoteSummary.price?.currency ?? null;
  const finCurrency = quoteSummary.financialData?.financialCurrency ?? null;

  if (priceCurrency === 'IDR' && finCurrency === 'USD') {
    // Diverifikasi empiris (2026-08-05): EPS & DPS Yahoo untuk emiten pelapor USD SUDAH
    // dalam IDR (ADRO harga 2520 / eps 309.74 = 8.13 = trailingPE yang dikembalikan
    // Yahoo apa adanya). Hanya BVPS & FCF yang masih USD.
    const exchangeRate = await getUsdIdrRate();
    if (exchangeRate == null) {
      // Temuan H-6: tanpa kurs, BVPS & FCF tidak bisa disamakan satuannya dengan harga.
      // Metode yang bergantung padanya (PBV Fair, Graham, DCF) DILEWATI - bukan dihitung
      // dari kurs karangan lalu disajikan sebagai nilai wajar.
      bvps = null;
      fcf_per_share = null;
    } else {
      if (bvps != null) bvps *= exchangeRate;
      if (fcf_per_share) fcf_per_share *= exchangeRate;
    }
  }
  // ------------------------------------------------

  const sector = quoteSummary.assetProfile?.sector || '';
  const isBank = sector.toLowerCase().includes('bank') || sector.toLowerCase().includes('financial');

  if (isBank) {
    fcf_per_share = null;
  }

  const methods: any = {};
  let validFairValues: number[] = [];

  let intrinsic_pbv = 0;
  let intrinsic_per = 0;
  let intrinsic_ddm = 0;
  let intrinsic_graham = 0;
  let intrinsic_dcf = 0;

  // 1. Graham Number
  if (eps != null && eps > 0 && bvps != null && bvps > 0) {
    intrinsic_graham = Math.sqrt(VALUATION_ASSUMPTIONS.GRAHAM_CONSTANT * eps * bvps);
    if (!isBank) {
      methods.graham = {
        name: 'Graham Number',
        value: intrinsic_graham,
        color: '#f59e0b' // yellow
      };
      validFairValues.push(intrinsic_graham);
    }
  }

  // 2 & 4. PBV Fair dan PER Fair - SATU model, sama dengan LensScore.
  //
  // PERBAIKAN C-05 (audit kuantitatif 2026-08-11). Sampai perbaikan ini, satu emiten yang
  // sama bisa menampilkan dua nilai wajar yang berbeda di dua tempat sekaligus:
  //
  //   komponen Valuasi di LensScore : PBV* = (ROE - g) / (r - g), r per emiten lewat CAPM
  //   kartu "Harga Wajar" di sini   : PBV* = (ROE / 12) x 0,85, r = 12% untuk SEMUA emiten
  //
  // Rumus kedua bahkan dikutip di dalam fair-multiples.service.ts sebagai CONTOH cara yang
  // salah, sementara ia tetap menghasilkan angka yang dilihat pengguna. Untuk ROE 20%,
  // g 5%, r 12% selisihnya 1,42x vs 2,14x - 50% pada angka yang langsung menentukan label
  // UNDERVALUED/OVERVALUED. Tidak ada cara bagi pengguna untuk tahu keduanya beda model.
  //
  // Sekarang keduanya memanggil impliedMultiples() yang sama. Konstanta PBV heuristik
  // (BANK_PBV_DIVISOR dkk) tidak lagi dipakai menghitung apa pun; lihat catatan di
  // VALUATION_ASSUMPTIONS.
  const sectorProfile = resolveSectorProfile(
    quoteSummary.assetProfile?.sector ?? null,
    quoteSummary.assetProfile?.industry ?? null,
  );
  const implied = impliedMultiples({
    roePct: roe,
    payoutRatio: isFiniteNumber(quoteSummary.summaryDetail?.payoutRatio)
      ? quoteSummary.summaryDetail.payoutRatio
      : null,
    beta: isFiniteNumber(quoteSummary.defaultKeyStatistics?.beta)
      ? quoteSummary.defaultKeyStatistics.beta
      : null,
    fallbackBeta: sectorProfile.defaultBeta,
  });

  if (implied.fairPbv != null && bvps != null && bvps > 0) {
    // Bank: BVPS diturunkan dari priceToBook kalau tersedia - bookValue Yahoo untuk bank
    // kerap tidak sinkron dengan harga. Perilaku ini dipertahankan apa adanya.
    const rawPbv = quoteSummary.defaultKeyStatistics?.priceToBook;
    const bvpsUsed = isBank && isFinitePositive(rawPbv) ? price / rawPbv : bvps;
    intrinsic_pbv = implied.fairPbv * bvpsUsed;

    if (intrinsic_pbv > 0) {
      methods.pbv = {
        name: 'PBV Fair (Gordon)',
        value: intrinsic_pbv,
        color: '#10b981' // emerald
      };
      if (!isBank) validFairValues.push(intrinsic_pbv);
    }
  }

  // 3. DDM
  if (dps != null && dps > 0) {
    const g = VALUATION_ASSUMPTIONS.PERPETUAL_GROWTH;
    if (isBank) {
      // Bank ber-ROE tinggi diberi discount rate sedikit lebih rendah (risiko dianggap
      // lebih terkendali) - asumsi model, bukan hasil pengukuran risiko emiten.
      const discountRate = roe != null && roe > 20 ? 0.105 : VALUATION_ASSUMPTIONS.DISCOUNT_RATE;
      intrinsic_ddm = (dps * (1 + g)) / (discountRate - g);
    } else {
      intrinsic_ddm = (dps * (1 + g)) / (VALUATION_ASSUMPTIONS.DISCOUNT_RATE - g);
    }
    methods.ddm = {
      name: 'DDM (Dividend)',
      value: intrinsic_ddm,
      color: '#3b82f6' // blue
    };
    if (!isBank) validFairValues.push(intrinsic_ddm);
  }

  // 4. PER Fair - dari model yang sama, bukan lagi pengali tetap 15x/14,5x untuk semua.
  if (eps != null && eps > 0 && implied.fairPer != null) {
    intrinsic_per = eps * implied.fairPer;
    methods.per = {
      // Basisnya ikut dinyatakan: 'no-growth' berarti ROE tidak tersedia dan angkanya
      // adalah perpetuitas 1/r - bersyarat, tidak setara dengan hasil Gordon penuh.
      name: implied.fairPerBasis === 'gordon' ? 'PER Fair (Gordon)' : 'PER Fair (tanpa pertumbuhan)',
      value: intrinsic_per,
      color: '#8b5cf6' // purple
    };
    if (!isBank) validFairValues.push(intrinsic_per);
  }

  // 5. Perpetuitas FCF satu tahap.
  //
  // PERBAIKAN H-04: metode ini dulu dilabeli "DCF (FCF)". Rumusnya
  // `fcf x 1,05 / (0,12 - 0,05)` adalah perpetuitas Gordon satu tahap - pengali tetap 15x
  // FCF untuk setiap emiten non-bank. Tidak ada proyeksi, tidak ada WACC per emiten, tidak
  // ada CAPEX atau perubahan modal kerja. Menyebutnya DCF membuat pengguna mengira ada
  // proyeksi arus kas di baliknya. DCF yang sesungguhnya ada di calculateDcfModel()
  // (halaman /dcf): proyeksi 5 tahun + tabel sensitivitas.
  if (!isBank && fcf_per_share && fcf_per_share > 0) {
    intrinsic_dcf = (fcf_per_share * (1 + VALUATION_ASSUMPTIONS.PERPETUAL_GROWTH))
      / (VALUATION_ASSUMPTIONS.DISCOUNT_RATE - VALUATION_ASSUMPTIONS.PERPETUAL_GROWTH);
    methods.dcf = {
      name: 'FCF Perpetuity (1-stage)',
      value: intrinsic_dcf,
      color: '#ec4899' // pink
    };
    validFairValues.push(intrinsic_dcf);
  }

  // Sector router menentukan *applicability*, bukan bobot numerik. Semua metode
  // applicable yang datanya valid diberi bobot sama (audit M-03).
  let applicableMethods = SECTOR_METHODS[sector] ?? SECTOR_METHODS.DEFAULT;
  for (const [key, methodsForSector] of Object.entries(SECTOR_METHODS)) {
    if (key !== 'DEFAULT' && sector.toLowerCase().includes(key.toLowerCase())) {
      applicableMethods = methodsForSector;
      break;
    }
  }

  const methodValues: Record<ValuationMethodKey, number> = {
    pbv: intrinsic_pbv,
    ddm: intrinsic_ddm,
    per: intrinsic_per,
    dcf: intrinsic_dcf,
    graham: intrinsic_graham,
  };
  const activeMethods = applicableMethods.filter((key) => methodValues[key] > 0);
  const activeWeights: Partial<Record<ValuationMethodKey, number>> = {};
  let fair_value = 0;

  if (activeMethods.length > 0) {
    const equalWeight = 1 / activeMethods.length;
    for (const key of activeMethods) {
      activeWeights[key] = equalWeight;
      fair_value += methodValues[key] * equalWeight;
    }
  } else if (validFairValues.length > 0) {
    // Fallback deterministik: median metode valid jika sector-applicability tidak
    // menemukan metode aktif. Tidak ada bobot hipotesis yang diciptakan di sini.
    const sortedFairValues = [...validFairValues].sort((a, b) => a - b);
    const mid = Math.floor(sortedFairValues.length / 2);
    fair_value = sortedFairValues.length % 2 !== 0
      ? sortedFairValues[mid]
      : (sortedFairValues[mid - 1] + sortedFairValues[mid]) / 2;
  }

  if (fair_value <= 0) return null;

  // Calculate MOS
  let mos = 0;
  if (fair_value > 0) {
    mos = ((fair_value - price) / fair_value) * 100;
  }

  return {
    simbol: ticker,
    sektor: sector,
    harga: price,
    eps,
    bvps,
    roe,
    dps,
    fcf_per_share,
    methods,
    fair_value,
    mos,
    applied_rule: activeWeights,
    // Asumsi model diekspos ke pemanggil (audit 2026-08-05, temuan H-3) supaya UI bisa
    // menampilkan DASAR angkanya, bukan cuma hasil akhirnya. "Harga wajar" di sini adalah
    // keluaran model dengan parameter tetap yang sama untuk semua emiten - bukan
    // pengukuran, bukan konsensus analis.
    assumptions: {
      is_model_estimate: true,
      // Dua tingkat diskonto sengaja dilaporkan berdampingan, bukan dilebur jadi satu
      // angka: PBV*/PER* memakai CAPM per emiten, sedangkan DDM dan perpetuitas FCF masih
      // memakai tarif tetap 12%. Menyembunyikan itu akan membuat "harga wajar" tampak
      // berasal dari satu model padahal berasal dari dua.
      discount_rate_pct: VALUATION_ASSUMPTIONS.DISCOUNT_RATE * 100,
      perpetual_growth_pct: VALUATION_ASSUMPTIONS.PERPETUAL_GROWTH * 100,
      fair_per: implied.fairPer,
      fair_pbv: implied.fairPbv,
      // Perbaikan C-05: PBV*/PER* kini memakai model yang SAMA dengan komponen Valuasi
      // LensScore. Ketiga field di bawah wajib ditampilkan ke pengguna - tanpa itu, angka
      // yang bersyarat (beta default sektor, PER tanpa pertumbuhan) tampak setara dengan
      // angka yang datanya lengkap.
      multiples_model: 'gordon-residual-income',
      fair_per_basis: implied.fairPerBasis,
      cost_of_equity_pct: implied.costOfEquityPct,
      growth_pct: implied.growthPct,
      beta_used: implied.betaUsed,
      beta_source: implied.betaSource,
      risk_free_rate_pct: MACRO_ASSUMPTIONS.RISK_FREE_RATE_PCT,
      equity_risk_premium_pct: MACRO_ASSUMPTIONS.EQUITY_RISK_PREMIUM_PCT,
      macro_set_on: MACRO_ASSUMPTIONS.SET_ON,
      // M-03: bobot numerik hipotesis sudah DIHAPUS. Sektor hanya menentukan metode
      // applicable, lalu metode yang tersedia digabung equal-weight.
      sector_weights_status: 'ARBITRARY_WEIGHTS_REMOVED',
      sector_aggregation_method: 'EQUAL_WEIGHT_AVAILABLE_APPLICABLE_METHODS',
      note: 'PBV & PER wajar memakai model Gordon dengan biaya ekuitas CAPM per emiten - sama dengan komponen Valuasi LensScore. DDM dan perpetuitas FCF masih memakai tingkat diskonto tetap 12% untuk semua emiten. Nilai wajar adalah keluaran model, bukan target harga analis. Router sektor hanya menentukan metode yang relevan; metode aktif digabung equal-weight.',
    },
  };
}

// Asumsi makro Indonesia dipakai sebagai proxy WACC (build-up sederhana ala CAPM:
// yield SBN 10Y sebagai risk-free rate + equity risk premium) - konsisten dipakai
// di seluruh perhitungan di bawah, bukan angka terpisah yang tidak nyambung dengan
// rumusnya (sebelumnya UI menampilkan "WACC 8.85%" sebagai fallback statis di
// sebelah rumus "6.7% + 5.2%" yang sebenarnya = 11.9% - dua angka yang tidak
// pernah dihitung dari rumus yang sama).
//
// BUG FIX (audit logika & algoritma 2026-08-05, temuan H-5): kedua angka ini ASUMSI
// STATIS, bukan data pasar - tapi dulu dikirim ke UI sebagai field bernama
// `sbn_10y_yield` yang terbaca seperti yield SBN 10 tahun yang sedang berlaku. Backend
// ini TIDAK punya sumber data yield SBN sama sekali (modules/macro/ hanya menyinkronkan
// kurs USD/IDR - lihat macro-refresh.service.ts). Nilainya tidak diubah (mengarang angka
// "lebih baru" tanpa sumber justru lebih buruk), tapi sekarang ditandai eksplisit sebagai
// asumsi lewat `is_assumption: true` + tanggal penetapan, supaya UI bisa melabelinya
// jujur alih-alih menyajikannya sebagai kondisi pasar terkini.
const SBN_10Y_YIELD_PCT = 6.7;
const EQUITY_RISK_PREMIUM_PCT = 5.2;
/** Kapan kedua asumsi di atas terakhir ditinjau manusia. Ditampilkan bersama angkanya. */
const MACRO_ASSUMPTION_SET_ON = '2026-08-03';
const TERMINAL_GROWTH_PCT = 3.5;
const PROJECTION_YEARS = 5;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// Model DCF 5-tahun + tabel sensitivitas WACC x Terminal Growth, dihitung dari FCF/share
// dan ROE riil yang sama seperti calculateIntrinsicValue() di atas (dengan fix currency
// USD/IDR yang sama) - dipakai oleh /app/dcf (halaman "DCF Intrinsic Valuation"), yang
// sebelumnya memanggil /api/live/[ticker] (cuma quote harga, tanpa data DCF sama sekali)
// sehingga semua angka WACC/FCF/sensitivitas selalu tampil kosong ("-").
export async function calculateDcfModel(rawTicker: string) {
  let ticker = rawTicker.toUpperCase();
  if (!ticker.includes('.')) {
    ticker = `${ticker}.JK`;
  }

  const quoteSummary = await yahooFinance.quoteSummary(ticker, {
    modules: ['assetProfile', 'defaultKeyStatistics', 'financialData', 'summaryDetail', 'price']
  });

  if (!quoteSummary) return null;

  const price = isFinitePositive(quoteSummary.price?.regularMarketPrice)
    ? quoteSummary.price.regularMarketPrice
    : null;
  if (price == null) return null;

  const roe = isFiniteNumber(quoteSummary.financialData?.returnOnEquity)
    ? quoteSummary.financialData.returnOnEquity * 100
    : null;
  const payoutRatio = quoteSummary.summaryDetail?.payoutRatio ?? null;
  const sector = quoteSummary.assetProfile?.sector || '';
  const isBank = sector.toLowerCase().includes('bank') || sector.toLowerCase().includes('financial');
  // BUG FIX (audit integritas data 2026-08-03, temuan C-09): sama seperti
  // calculateIntrinsicValue() di atas - `|| 1` membuat FCF total perusahaan lolos
  // sebagai "FCF per lembar" saat sharesOutstanding hilang, meledakkan fair value DCF.
  let shares = quoteSummary.defaultKeyStatistics?.sharesOutstanding;
  let fcf = isFiniteNumber(quoteSummary.financialData?.freeCashflow)
    ? quoteSummary.financialData.freeCashflow
    : null;
  let fcfPerShare = (fcf && isFinitePositive(shares)) ? fcf / shares : null;
  let totalDebt = isFiniteNumber(quoteSummary.financialData?.totalDebt)
    ? quoteSummary.financialData.totalDebt
    : null;
  let totalCash = isFiniteNumber(quoteSummary.financialData?.totalCash)
    ? quoteSummary.financialData.totalCash
    : null;

  // Bank/institusi keuangan tidak punya "Free Cash Flow" dalam pengertian yang sama
  // (arus kas operasionalnya didominasi penempatan kredit/simpanan, bukan capex vs
  // operating cash flow biasa) - model DCF berbasis FCF secara sengaja TIDAK berlaku
  // untuk sektor ini, sama seperti calculateIntrinsicValue() di atas yang memakai
  // PBV/DDM/PER untuk bank alih-alih DCF. Kembalikan status jelas, bukan diam-diam
  // menampilkan tabel kosong ("-") tanpa penjelasan.
  if (isBank) {
    return {
      stock: { symbol: ticker },
      quant: { current_price: price, not_applicable: true },
      analysis: {
        executive_summary: `${ticker} adalah emiten sektor keuangan/bank - model DCF berbasis Free Cash Flow tidak berlaku untuk sektor ini (arus kasnya didominasi kredit & simpanan, bukan capex operasional biasa). Gunakan LensFundamental (metode PBV/DDM) untuk valuasi saham bank.`,
      },
      not_applicable_reason: 'SECTOR_BANK',
    };
  }

  // Fix mismatch mata uang USD (laporan keuangan) vs IDR (harga saham) - sama seperti
  // calculateIntrinsicValue(); tanpa ini FCF/share emiten pelapor USD (mis. ADRO.JK)
  // jadi ~15.000x lebih kecil dari harga sahamnya.
  const priceCurrency = quoteSummary.price?.currency ?? null;
  const finCurrency = quoteSummary.financialData?.financialCurrency ?? null;
  if (priceCurrency === 'IDR' && finCurrency === 'USD' && fcfPerShare) {
    const exchangeRate = await getUsdIdrRate();
    // Temuan H-6: tanpa kurs, FCF/share (USD) tidak bisa dibandingkan dengan harga (IDR).
    // null di sini membuat cabang "NO_FCF_DATA" di bawah aktif - model DCF dilewati,
    // bukan dihitung dengan kurs karangan.
    if (exchangeRate != null) {
      fcfPerShare *= exchangeRate;
      if (totalDebt != null) totalDebt *= exchangeRate;
      if (totalCash != null) totalCash *= exchangeRate;
    } else {
      fcfPerShare = null;
      totalDebt = null;
      totalCash = null;
    }
  }

  if (!fcfPerShare || fcfPerShare <= 0) {
    return {
      stock: { symbol: ticker },
      quant: { current_price: price, not_applicable: true },
      analysis: {
        executive_summary: `Data Free Cash Flow untuk ${ticker} tidak tersedia dari sumber data (Yahoo Finance) saat ini, sehingga model DCF tidak dapat dihitung. Coba metode valuasi lain di LensFundamental.`,
      },
      not_applicable_reason: 'NO_FCF_DATA',
    };
  }

  if (roe == null) {
    return {
      stock: { symbol: ticker },
      quant: { current_price: price, not_applicable: true },
      analysis: {
        executive_summary: `Data ROE untuk ${ticker} tidak tersedia dari sumber data (Yahoo Finance), sehingga pertumbuhan FCF proyeksi tidak dapat dihitung dari data fundamental yang diklaim model ini.`,
      },
      not_applicable_reason: 'NO_ROE_DATA',
    };
  }

  if (!isFinitePositive(shares) || totalDebt == null || totalCash == null) {
    return {
      stock: { symbol: ticker },
      quant: { current_price: price, not_applicable: true },
      analysis: {
        executive_summary: `Data utang/kas untuk ${ticker} tidak tersedia lengkap dari Yahoo Finance, sehingga nilai ekuitas tidak bisa dipisahkan dari nilai perusahaan. Model DCF tidak dihitung agar tidak menampilkan enterprise value sebagai harga wajar saham.`,
      },
      not_applicable_reason: 'NO_BALANCE_SHEET_DATA',
    };
  }

  const discountRatePct = SBN_10Y_YIELD_PCT + EQUITY_RISK_PREMIUM_PCT;
  const discountRate = discountRatePct / 100;
  const netDebtPerShare = (totalDebt - totalCash) / shares;

  // Growth rate proyeksi 5 tahun: sustainable growth rate riil (ROE x retention ratio)
  // kalau payout ratio tersedia, dibatasi ke rentang wajar 2-12% supaya tidak meledak
  // untuk emiten ROE ekstrem - bukan angka tebakan tetap untuk semua saham.
  const retentionRatio = payoutRatio != null ? clamp(1 - payoutRatio, 0, 1) : 0.6;
  const rawGrowth = (roe / 100) * retentionRatio;
  const projectionGrowth = clamp(rawGrowth, 0.02, 0.12);

  function buildProjection(discountRateInput: number, terminalGrowthRate: number) {
    const fcfProjections: { year: number; fcf_per_share: number; pv_fcf: number }[] = [];
    let pvFcfSum = 0;
    let fcfYearN = fcfPerShare as number;
    const currentYear = new Date().getFullYear();
    for (let y = 1; y <= PROJECTION_YEARS; y++) {
      fcfYearN = fcfYearN * (1 + projectionGrowth);
      const pv = fcfYearN / Math.pow(1 + discountRateInput, y);
      pvFcfSum += pv;
      fcfProjections.push({ year: currentYear + y, fcf_per_share: fcfYearN, pv_fcf: pv });
    }
    const terminalValue = (fcfYearN * (1 + terminalGrowthRate)) / (discountRateInput - terminalGrowthRate);
    const pvTerminalValue = terminalValue / Math.pow(1 + discountRateInput, PROJECTION_YEARS);
    const enterpriseValuePerShare = pvFcfSum + pvTerminalValue;
    const fairValue = enterpriseValuePerShare - netDebtPerShare;
    return { fcfProjections, pvFcfSum, pvTerminalValue, enterpriseValuePerShare, fairValue };
  }

  const base = buildProjection(discountRate, TERMINAL_GROWTH_PCT / 100);
  const fairValue = base.fairValue;
  if (!Number.isFinite(fairValue) || fairValue <= 0) {
    return {
      stock: { symbol: ticker },
      quant: {
        current_price: price,
        not_applicable: true,
        enterprise_value_per_share: Math.round(base.enterpriseValuePerShare),
        net_debt_per_share: Math.round(netDebtPerShare),
      },
      analysis: {
        executive_summary: `Nilai operasi DCF ${ticker} setelah dikurangi utang bersih menghasilkan nilai ekuitas <= 0. Model tidak menampilkan target harga positif karena itu akan menyesatkan.`,
      },
      not_applicable_reason: 'NEGATIVE_EQUITY_VALUE',
    };
  }
  const mos = fairValue > 0 && price > 0 ? ((fairValue - price) / fairValue) * 100 : 0;
  const valuationStatus = mos >= 0 ? 'UNDERVALUED' : 'OVERVALUED';

  // Sensitivitas: WACC -1%/base/+1% (baris) x Terminal Growth 3.0/3.5/4.0% (kolom) -
  // tiap sel dihitung ulang dengan model yang sama, bukan interpolasi kira-kira.
  const discountRateRows = [discountRatePct - 1, discountRatePct, discountRatePct + 1];
  const growthCols = [3.0, 3.5, 4.0];
  const sensitivityTable = discountRateRows.map((rateRow) => {
    const row: Record<string, any> = { discount_rate_pct: rateRow.toFixed(2), wacc_pct: rateRow.toFixed(2) };
    growthCols.forEach((g) => {
      const result = rateRow > g ? buildProjection(rateRow / 100, g / 100) : null;
      row[`g_${g.toFixed(1)}%`] = result ? Math.round(result.fairValue) : null;
    });
    return row;
  });

  return {
    stock: { symbol: ticker },
    quant: {
      current_price: price,
      discount_rate_pct: parseFloat(discountRatePct.toFixed(2)),
      cost_of_equity_pct: parseFloat(discountRatePct.toFixed(2)),
      // Backward-compatible alias; UI baru melabelinya sebagai discount rate proxy,
      // bukan WACC aktual karena struktur modal/beta emiten belum dihitung.
      wacc_pct: parseFloat(discountRatePct.toFixed(2)),
      sbn_10y_yield: SBN_10Y_YIELD_PCT,
      risk_premium: EQUITY_RISK_PREMIUM_PCT,
      terminal_growth_pct: TERMINAL_GROWTH_PCT,
      fair_value: Math.round(fairValue),
      enterprise_value_per_share: Math.round(base.enterpriseValuePerShare),
      net_debt_per_share: Math.round(netDebtPerShare),
      valuation_status: valuationStatus,
      pv_fcf_sum: Math.round(base.pvFcfSum),
      pv_terminal_value: Math.round(base.pvTerminalValue),
      fcf_projections: base.fcfProjections.map((f) => ({
        year: f.year,
        fcf_per_share: Math.round(f.fcf_per_share),
        pv_fcf: Math.round(f.pv_fcf),
      })),
      sensitivity_table: sensitivityTable,
      // Penanda jujur (temuan H-5): risk-free rate & equity risk premium di sini ASUMSI
      // statis, bukan pembacaan pasar. UI wajib menampilkannya sebagai asumsi.
      assumptions: {
        is_assumption: true,
        set_on: MACRO_ASSUMPTION_SET_ON,
        note: 'SBN 10Y & equity risk premium adalah asumsi tetap yang ditinjau manual - backend ini tidak tersambung ke sumber data yield SBN. Ubah asumsi, dan nilai wajar ikut berubah (lihat tabel sensitivitas).',
      },
    },
    analysis: {
      executive_summary: `Model DCF 5-tahun memakai discount rate proxy ${discountRatePct.toFixed(1)}% (= asumsi SBN 10Y ${SBN_10Y_YIELD_PCT}% + premi risiko ekuitas ${EQUITY_RISK_PREMIUM_PCT}%, tetap per ${MACRO_ASSUMPTION_SET_ON}); FCF dihitung sebagai nilai operasi lalu dikurangi utang bersih per saham Rp ${Math.round(netDebtPerShare).toLocaleString('id-ID')}. Nilai wajar ekuitas Rp ${Math.round(fairValue).toLocaleString('id-ID')} vs harga pasar Rp ${Math.round(price).toLocaleString('id-ID')} - margin of safety ${mos >= 0 ? '+' : ''}${mos.toFixed(1)}%. Ini keluaran MODEL, bukan target harga; lihat tabel sensitivitas.`,
    },
  };
}
