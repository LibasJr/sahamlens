import YahooFinanceClass from 'yahoo-finance2';
import { getUsdIdrRate } from '../../../shared/market/usd-idr-rate';

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
  /** PER "wajar" acuan. Angka konvensi pasar, bukan hasil regresi atas data IDX. */
  FAIR_PER_NON_BANK: 15,
  FAIR_PER_BANK: 14.5,
  /** Faktor PBV wajar = (ROE / pembagi) x pengali. Heuristik industri, bukan turunan
   * teoritis - dilaporkan apa adanya ke UI lewat `assumptions` di bawah. */
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

const SECTOR_RULES: Record<string, any> = {
  "Banks - Regional": { pbv: 0.45, ddm: 0.30, per: 0.25, dcf: 0, graham: 0 },
  "Banks": { pbv: 0.45, ddm: 0.30, per: 0.25, dcf: 0, graham: 0 },
  "Financial Services": { pbv: 0.45, ddm: 0.30, per: 0.25, dcf: 0, graham: 0 },
  "Consumer Defensive": { per: 0.40, dcf: 0.30, ddm: 0.15, graham: 0.15, pbv: 0 },
  "Consumer Cyclical": { per: 0.40, dcf: 0.30, ddm: 0.15, graham: 0.15, pbv: 0 },
  "Energy": { pbv: 0.40, ddm: 0.35, per: 0.25, dcf: 0, graham: 0 },
  "Basic Materials": { pbv: 0.40, ddm: 0.35, per: 0.25, dcf: 0, graham: 0 },
  "Real Estate": { pbv: 0.50, per: 0.30, ddm: 0.20, dcf: 0, graham: 0 },
  "Communication Services": { dcf: 0.40, per: 0.30, ddm: 0.30, pbv: 0, graham: 0 },
  "Industrials": { per: 0.35, dcf: 0.35, pbv: 0.15, ddm: 0.15, graham: 0 },
  "Healthcare": { per: 0.40, dcf: 0.30, pbv: 0.20, ddm: 0.10, graham: 0 },
  "DEFAULT": { per: 0.35, dcf: 0.25, pbv: 0.20, ddm: 0.10, graham: 0.10 }
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

  // 2. PBV Fair
  if (roe != null && roe > 0 && bvps != null && bvps > 0) {
    if (isBank) {
      // FIX: Bank PBV Fair
      const rawPbv = quoteSummary.defaultKeyStatistics?.priceToBook;
      let calcBvps = isFinitePositive(rawPbv)
        ? price / rawPbv
        : bvps;

      let pbvWajar = (roe / VALUATION_ASSUMPTIONS.BANK_PBV_DIVISOR) * VALUATION_ASSUMPTIONS.BANK_PBV_MULTIPLIER;
      if (roe > 20) {
        pbvWajar = (roe / VALUATION_ASSUMPTIONS.BANK_HIGH_ROE_DIVISOR) * VALUATION_ASSUMPTIONS.BANK_HIGH_ROE_MULTIPLIER;
      }
      // Cap saja di 3.2 (hindari valuasi ekstrem untuk ROE sangat tinggi) - TANPA floor
      // 2.5. Floor unconditional sebelumnya memaksa bank ber-ROE rendah (mis. 3% -> PBV
      // mentah 0.35x) tetap dinilai 2.5x, melambungkan fair value/MoS dan berpotensi
      // menandai bank yang fundamentalnya lemah sebagai "undervalued".
      pbvWajar = Math.min(pbvWajar, VALUATION_ASSUMPTIONS.BANK_PBV_CAP);
      intrinsic_pbv = pbvWajar * calcBvps;
    } else {
      let pbvWajar = (roe / VALUATION_ASSUMPTIONS.NON_BANK_PBV_DIVISOR) * VALUATION_ASSUMPTIONS.NON_BANK_PBV_MULTIPLIER;
      intrinsic_pbv = pbvWajar * bvps;
    }

    if (intrinsic_pbv > 0) {
      methods.pbv = {
        name: 'PBV Fair',
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

  // 4. PER Fair
  if (eps != null && eps > 0) {
    // FIX PER FAIR: Use 14.5 for banks, 15 for others
    const defaultPER = isBank ? VALUATION_ASSUMPTIONS.FAIR_PER_BANK : VALUATION_ASSUMPTIONS.FAIR_PER_NON_BANK;
    intrinsic_per = eps * defaultPER;
    methods.per = {
      name: 'PER Fair',
      value: intrinsic_per,
      color: '#8b5cf6' // purple
    };
    if (!isBank) validFairValues.push(intrinsic_per);
  }

  // 5. DCF
  if (!isBank && fcf_per_share && fcf_per_share > 0) {
    intrinsic_dcf = (fcf_per_share * (1 + VALUATION_ASSUMPTIONS.PERPETUAL_GROWTH))
      / (VALUATION_ASSUMPTIONS.DISCOUNT_RATE - VALUATION_ASSUMPTIONS.PERPETUAL_GROWTH);
    methods.dcf = {
      name: 'DCF (FCF)',
      value: intrinsic_dcf,
      color: '#ec4899' // pink
    };
    validFairValues.push(intrinsic_dcf);
  }

  // Calculate Fair Value with Sector Router
  let rule = SECTOR_RULES[sector] || SECTOR_RULES["DEFAULT"];

  // Check if sector matches any key dynamically
  for (const key in SECTOR_RULES) {
    if (sector.toLowerCase().includes(key.toLowerCase())) {
      rule = SECTOR_RULES[key];
      break;
    }
  }

  let activeWeights: any = {};
  let totalWeightUsed = 0;

  // Collect active methods based on what successfully computed > 0
  if (intrinsic_pbv > 0 && rule.pbv > 0) { activeWeights.pbv = rule.pbv; totalWeightUsed += rule.pbv; }
  if (intrinsic_ddm > 0 && rule.ddm > 0) { activeWeights.ddm = rule.ddm; totalWeightUsed += rule.ddm; }
  if (intrinsic_per > 0 && rule.per > 0) { activeWeights.per = rule.per; totalWeightUsed += rule.per; }
  if (intrinsic_dcf > 0 && rule.dcf > 0) { activeWeights.dcf = rule.dcf; totalWeightUsed += rule.dcf; }
  if (intrinsic_graham > 0 && rule.graham > 0) { activeWeights.graham = rule.graham; totalWeightUsed += rule.graham; }

  // Redistribute weights if total < 1 (e.g. DDM was 0 because no dividend)
  if (totalWeightUsed > 0 && totalWeightUsed < 1) {
    const multiplier = 1 / totalWeightUsed;
    for (const k in activeWeights) {
      activeWeights[k] = activeWeights[k] * multiplier;
    }
  }

  let fair_value = 0;
  if (totalWeightUsed > 0) {
    fair_value =
      (intrinsic_pbv * (activeWeights.pbv ?? 0)) +
      (intrinsic_ddm * (activeWeights.ddm ?? 0)) +
      (intrinsic_per * (activeWeights.per ?? 0)) +
      (intrinsic_dcf * (activeWeights.dcf ?? 0)) +
      (intrinsic_graham * (activeWeights.graham ?? 0));
  } else {
    // Fallback to median if nothing matched weights (rare fallback)
    if (validFairValues.length > 0) {
      validFairValues.sort((a, b) => a - b);
      const mid = Math.floor(validFairValues.length / 2);
      fair_value = validFairValues.length % 2 !== 0
        ? validFairValues[mid]
        : (validFairValues[mid - 1] + validFairValues[mid]) / 2;
    }
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
      discount_rate_pct: VALUATION_ASSUMPTIONS.DISCOUNT_RATE * 100,
      perpetual_growth_pct: VALUATION_ASSUMPTIONS.PERPETUAL_GROWTH * 100,
      fair_per: isBank ? VALUATION_ASSUMPTIONS.FAIR_PER_BANK : VALUATION_ASSUMPTIONS.FAIR_PER_NON_BANK,
      note: 'Nilai wajar adalah hasil model dengan asumsi tetap (discount rate & pertumbuhan perpetuitas sama untuk semua emiten), bukan target harga analis.',
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
    fcfPerShare = exchangeRate != null ? fcfPerShare * exchangeRate : null;
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

  const waccPct = SBN_10Y_YIELD_PCT + EQUITY_RISK_PREMIUM_PCT;
  const wacc = waccPct / 100;

  // Growth rate proyeksi 5 tahun: sustainable growth rate riil (ROE x retention ratio)
  // kalau payout ratio tersedia, dibatasi ke rentang wajar 2-12% supaya tidak meledak
  // untuk emiten ROE ekstrem - bukan angka tebakan tetap untuk semua saham.
  const retentionRatio = payoutRatio != null ? clamp(1 - payoutRatio, 0, 1) : 0.6;
  const rawGrowth = (roe / 100) * retentionRatio;
  const projectionGrowth = clamp(rawGrowth, 0.02, 0.12);

  function buildProjection(waccRate: number, terminalGrowthRate: number) {
    const fcfProjections: { year: number; fcf_per_share: number; pv_fcf: number }[] = [];
    let pvFcfSum = 0;
    let fcfYearN = fcfPerShare as number;
    const currentYear = new Date().getFullYear();
    for (let y = 1; y <= PROJECTION_YEARS; y++) {
      fcfYearN = fcfYearN * (1 + projectionGrowth);
      const pv = fcfYearN / Math.pow(1 + waccRate, y);
      pvFcfSum += pv;
      fcfProjections.push({ year: currentYear + y, fcf_per_share: fcfYearN, pv_fcf: pv });
    }
    const terminalValue = (fcfYearN * (1 + terminalGrowthRate)) / (waccRate - terminalGrowthRate);
    const pvTerminalValue = terminalValue / Math.pow(1 + waccRate, PROJECTION_YEARS);
    const fairValue = pvFcfSum + pvTerminalValue;
    return { fcfProjections, pvFcfSum, pvTerminalValue, fairValue };
  }

  const base = buildProjection(wacc, TERMINAL_GROWTH_PCT / 100);
  const fairValue = base.fairValue;
  const mos = fairValue > 0 && price > 0 ? ((fairValue - price) / fairValue) * 100 : 0;
  const valuationStatus = mos >= 0 ? 'UNDERVALUED' : 'OVERVALUED';

  // Sensitivitas: WACC -1%/base/+1% (baris) x Terminal Growth 3.0/3.5/4.0% (kolom) -
  // tiap sel dihitung ulang dengan model yang sama, bukan interpolasi kira-kira.
  const waccRows = [waccPct - 1, waccPct, waccPct + 1];
  const growthCols = [3.0, 3.5, 4.0];
  const sensitivityTable = waccRows.map((wRow) => {
    const row: Record<string, any> = { wacc_pct: wRow.toFixed(2) };
    growthCols.forEach((g) => {
      const result = wRow > g ? buildProjection(wRow / 100, g / 100) : null;
      row[`g_${g.toFixed(1)}%`] = result ? Math.round(result.fairValue) : null;
    });
    return row;
  });

  return {
    stock: { symbol: ticker },
    quant: {
      current_price: price,
      wacc_pct: parseFloat(waccPct.toFixed(2)),
      sbn_10y_yield: SBN_10Y_YIELD_PCT,
      risk_premium: EQUITY_RISK_PREMIUM_PCT,
      terminal_growth_pct: TERMINAL_GROWTH_PCT,
      fair_value: Math.round(fairValue),
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
      executive_summary: `Model DCF 5-tahun (WACC ${waccPct.toFixed(1)}% = asumsi SBN 10Y ${SBN_10Y_YIELD_PCT}% + premi risiko ekuitas ${EQUITY_RISK_PREMIUM_PCT}%, keduanya asumsi tetap per ${MACRO_ASSUMPTION_SET_ON}, bukan pembacaan pasar terkini; pertumbuhan FCF proyeksi ${(projectionGrowth * 100).toFixed(1)}%/tahun dari ROE & rasio retensi riil; terminal growth ${TERMINAL_GROWTH_PCT}%) menghasilkan nilai wajar Rp ${Math.round(fairValue).toLocaleString('id-ID')} vs harga pasar Rp ${Math.round(price).toLocaleString('id-ID')} - margin of safety ${mos >= 0 ? '+' : ''}${mos.toFixed(1)}%. Ini keluaran MODEL dengan asumsi di atas, bukan target harga; lihat tabel sensitivitas untuk melihat seberapa besar hasilnya bergeser kalau asumsinya berubah.`,
    },
  };
}
