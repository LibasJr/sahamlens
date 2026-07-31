import YahooFinanceClass from 'yahoo-finance2';

// BUILD 004 (AI Architecture) - dipindah verbatim dari app/api/intrinsic/[ticker]/route.ts
// supaya bisa dipakai ulang oleh Valuation Agent di modules/ai/service/orchestrator.service.ts
// tanpa endpoint itu memanggil dirinya sendiri lewat HTTP. Logika perhitungan TIDAK diubah.

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

  let price = quoteSummary.price?.regularMarketPrice || 0;
  let eps = quoteSummary.defaultKeyStatistics?.trailingEps || 0;
  let bvps = quoteSummary.defaultKeyStatistics?.bookValue || 0;
  let roe = (quoteSummary.financialData?.returnOnEquity || 0) * 100;
  let dps = quoteSummary.summaryDetail?.dividendRate || 0;

  // Fetch NIM if available
  let nim = 0.055; // default bank
  if (quoteSummary.financialData?.profitMargins) {
    // Sometimes NIM is stored in profitMargins for banks
    nim = quoteSummary.financialData.profitMargins;
  }

  // Fallback FCF
  let fcf = quoteSummary.financialData?.freeCashflow || null;
  let shares = quoteSummary.defaultKeyStatistics?.sharesOutstanding || 1;
  let fcf_per_share = fcf ? fcf / shares : null;

  // --- BUG FIX: CURRENCY MISMATCH (USD vs IDR) ---
  // Emiten seperti ERTX, ITMG, MEDC melapor dalam USD. Yahoo Finance memberikan EPS dalam USD tapi Harga dalam IDR.
  // Ini menyebabkan P/E menjadi 160.000x dan Harga Wajar (Intrinsic) hancur menjadi Rp 0.
  const priceCurrency = quoteSummary.price?.currency || 'IDR';
  const finCurrency = quoteSummary.financialData?.financialCurrency || 'IDR';

  if (priceCurrency === 'IDR' && finCurrency === 'USD') {
    let exchangeRate = 15500; // Safe fallback
    try {
      const fx = await yahooFinance.quote('USDIDR=X');
      if (fx && fx.regularMarketPrice) exchangeRate = fx.regularMarketPrice;
    } catch (e) {
      console.warn("Failed to fetch USDIDR, using fallback 15500");
    }
    // FIX: Yahoo Finance EPS & DPS are ALREADY in IDR.
    // Only BVPS and FCF are in USD.
    bvps *= exchangeRate;
    if (fcf_per_share) fcf_per_share *= exchangeRate;
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
  if (eps > 0 && bvps > 0) {
    intrinsic_graham = Math.sqrt(22.5 * eps * bvps);
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
  if (roe > 0 && bvps > 0) {
    if (isBank) {
      // FIX: Bank PBV Fair
      let calcBvps = price > 0 && (quoteSummary.defaultKeyStatistics?.priceToBook || 0) > 0
        ? price / quoteSummary.defaultKeyStatistics.priceToBook
        : bvps;

      let pbvWajar = (roe / 12) * 1.4; // Premium 40% for CASA
      if (roe > 20) {
        pbvWajar = (roe / 11) * 1.3; // Specific rule for high ROE banks
      }
      pbvWajar = Math.max(2.5, Math.min(pbvWajar, 3.2)); // Clamp 2.5 - 3.2 for banks
      intrinsic_pbv = pbvWajar * calcBvps;
    } else {
      let pbvWajar = (roe / 12) * 0.85;
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
  if (dps > 0) {
    if (isBank) {
      // FIX DDM Bank: Max growth 5%
      let discountRate = roe > 20 ? 0.105 : 0.12;
      intrinsic_ddm = (dps * 1.05) / (discountRate - 0.05);
    } else {
      // Growth 5% (bukan 8%) - konsisten dengan asumsi DCF & DDM bank di atas.
      // g=8% vs r=12% bikin pembagi cuma 0.04 -> DPS di-leverage ~27x, fair value meledak untuk saham dividen tinggi.
      intrinsic_ddm = (dps * 1.05) / (0.12 - 0.05);
    }
    methods.ddm = {
      name: 'DDM (Dividend)',
      value: intrinsic_ddm,
      color: '#3b82f6' // blue
    };
    if (!isBank) validFairValues.push(intrinsic_ddm);
  }

  // 4. PER Fair
  if (eps > 0) {
    // FIX PER FAIR: Use 14.5 for banks, 15 for others
    const defaultPER = isBank ? 14.5 : 15;
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
    intrinsic_dcf = (fcf_per_share * 1.05) / (0.12 - 0.05);
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
      (intrinsic_pbv * (activeWeights.pbv || 0)) +
      (intrinsic_ddm * (activeWeights.ddm || 0)) +
      (intrinsic_per * (activeWeights.per || 0)) +
      (intrinsic_dcf * (activeWeights.dcf || 0)) +
      (intrinsic_graham * (activeWeights.graham || 0));
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

  // Calculate MOS
  let mos = 0;
  if (fair_value > 0 && price > 0) {
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
    applied_rule: activeWeights
  };
}

// Asumsi makro Indonesia dipakai sebagai proxy WACC (build-up sederhana ala CAPM:
// yield SBN 10Y sebagai risk-free rate + equity risk premium) - konsisten dipakai
// di seluruh perhitungan di bawah, bukan angka terpisah yang tidak nyambung dengan
// rumusnya (sebelumnya UI menampilkan "WACC 8.85%" sebagai fallback statis di
// sebelah rumus "6.7% + 5.2%" yang sebenarnya = 11.9% - dua angka yang tidak
// pernah dihitung dari rumus yang sama).
const SBN_10Y_YIELD_PCT = 6.7;
const EQUITY_RISK_PREMIUM_PCT = 5.2;
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

  const price = quoteSummary.price?.regularMarketPrice || 0;
  const roe = (quoteSummary.financialData?.returnOnEquity || 0) * 100;
  const payoutRatio = quoteSummary.summaryDetail?.payoutRatio ?? null;
  const sector = quoteSummary.assetProfile?.sector || '';
  const isBank = sector.toLowerCase().includes('bank') || sector.toLowerCase().includes('financial');
  let shares = quoteSummary.defaultKeyStatistics?.sharesOutstanding || 1;
  let fcf = quoteSummary.financialData?.freeCashflow || null;
  let fcfPerShare = fcf ? fcf / shares : null;

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
        executive_summary: `${ticker} adalah emiten sektor keuangan/bank - model DCF berbasis Free Cash Flow tidak berlaku untuk sektor ini (arus kasnya didominasi kredit & simpanan, bukan capex operasional biasa). Gunakan Fundamental Analyzer (metode PBV/DDM) untuk valuasi saham bank.`,
      },
      not_applicable_reason: 'SECTOR_BANK',
    };
  }

  // Fix mismatch mata uang USD (laporan keuangan) vs IDR (harga saham) - sama seperti
  // calculateIntrinsicValue(); tanpa ini FCF/share emiten pelapor USD (mis. ADRO.JK)
  // jadi ~15.000x lebih kecil dari harga sahamnya.
  const priceCurrency = quoteSummary.price?.currency || 'IDR';
  const finCurrency = quoteSummary.financialData?.financialCurrency || 'IDR';
  if (priceCurrency === 'IDR' && finCurrency === 'USD' && fcfPerShare) {
    let exchangeRate = 15500;
    try {
      const fx = await yahooFinance.quote('USDIDR=X');
      if (fx && fx.regularMarketPrice) exchangeRate = fx.regularMarketPrice;
    } catch (e) {
      console.warn('Failed to fetch USDIDR, using fallback 15500');
    }
    fcfPerShare *= exchangeRate;
  }

  if (!fcfPerShare || fcfPerShare <= 0) {
    return {
      stock: { symbol: ticker },
      quant: { current_price: price, not_applicable: true },
      analysis: {
        executive_summary: `Data Free Cash Flow untuk ${ticker} tidak tersedia dari sumber data (Yahoo Finance) saat ini, sehingga model DCF tidak dapat dihitung. Coba metode valuasi lain di Fundamental Analyzer.`,
      },
      not_applicable_reason: 'NO_FCF_DATA',
    };
  }

  const waccPct = SBN_10Y_YIELD_PCT + EQUITY_RISK_PREMIUM_PCT;
  const wacc = waccPct / 100;

  // Growth rate proyeksi 5 tahun: sustainable growth rate riil (ROE x retention ratio)
  // kalau payout ratio tersedia, dibatasi ke rentang wajar 2-12% supaya tidak meledak
  // untuk emiten ROE ekstrem - bukan angka tebakan tetap untuk semua saham.
  const retentionRatio = payoutRatio != null ? clamp(1 - payoutRatio, 0, 1) : 0.6;
  const rawGrowth = (roe / 100) * retentionRatio;
  const projectionGrowth = clamp(rawGrowth || 0.05, 0.02, 0.12);

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
    },
    analysis: {
      executive_summary: `Model DCF 5-tahun (WACC ${waccPct.toFixed(1)}%, pertumbuhan FCF proyeksi ${(projectionGrowth * 100).toFixed(1)}%/tahun dari ROE & rasio retensi riil, terminal growth ${TERMINAL_GROWTH_PCT}%) menghasilkan nilai wajar Rp ${Math.round(fairValue).toLocaleString('id-ID')} vs harga pasar Rp ${Math.round(price).toLocaleString('id-ID')} - margin of safety ${mos >= 0 ? '+' : ''}${mos.toFixed(1)}%, mengindikasikan saham ini ${valuationStatus === 'UNDERVALUED' ? 'berada di bawah' : 'berada di atas'} nilai intrinsiknya.`,
    },
  };
}
