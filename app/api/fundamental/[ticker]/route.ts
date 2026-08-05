import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';
import { getUsdIdrRate } from '@/shared/market/usd-idr-rate';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

import {
  analyzePe,
  analyzePbv,
  analyzeRoe,
  analyzeRoa,
  analyzeDer,
  analyzeCurrentRatio,
  analyzeQuickRatio,
  analyzeDividend,
  analyzeEpsGrowth,
  analyzeRevenueGrowth,
  analyzeGrossMargin,
  analyzeOperatingMargin,
  analyzeNetMargin,
  calculateIntrinsicValue,
  computeFundamentalQuality,
  computeValuationLabel,
} from '@/modules/fundamental';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker: rawTicker } = await params;
    let ticker = rawTicker.toUpperCase();
    if (!ticker.includes('.')) {
      ticker = `${ticker}.JK`;
    }

    // Fetch Yahoo Finance Fundamental Data
    const quoteSummary = await yahooFinance.quoteSummary(ticker, {
      modules: ['defaultKeyStatistics', 'financialData', 'summaryDetail', 'price', 'assetProfile']
    });

    if (!quoteSummary) {
      return NextResponse.json({ error: 'Failed to fetch Fundamental data' }, { status: 404 });
    }

    const currentPrice = quoteSummary.price?.regularMarketPrice || 0;

    // --- BUG FIX: CURRENCY MISMATCH (USD vs IDR) ---
    // Emiten seperti ADRO, ITMG, MEDC melapor dalam USD tapi harga sahamnya dalam IDR.
    //
    // BUG FIX (audit integritas data 2026-08-03, temuan C-06): baris ini SEBELUMNYA juga
    // mengalikan trailingEps/forwardEps/dividendRate dengan exchangeRate. Diverifikasi
    // empiris (yahoo-finance2, 2026-08-03): EPS Yahoo untuk emiten pelapor USD SUDAH
    // dalam IDR (ADRO price=2470, eps=310.45, dan 2470/310.45=7.96 = persis summaryDetail
    // .trailingPE yang dikembalikan Yahoo apa adanya) - konsisten dengan
    // modules/fundamental/service/dcf-valuation.service.ts:70-71 ("Yahoo Finance EPS &
    // DPS are ALREADY in IDR. Only BVPS and FCF are in USD."). Mengalikan EPS lagi dengan
    // kurs (~16.300) membuat PER ADRO/ITMG hancur dari ~8x menjadi ~0,0005x, dan membuat
    // analyzePe() memvote BULLISH confidence 95 untuk SETIAP emiten pelapor USD tanpa
    // peduli valuasi sesungguhnya. Sekarang HANYA BVPS dan item arus kas (yang memang
    // dalam USD) yang dikonversi - EPS, dividendRate, trailingPE, forwardPE dibiarkan
    // apa adanya dari Yahoo (sudah IDR, sudah benar).
    const priceCurrency = quoteSummary.price?.currency || 'IDR';
    const finCurrency = quoteSummary.financialData?.financialCurrency || 'IDR';

    // BUG FIX (audit 2026-08-05, temuan H-6): `let exchangeRate = 15500` dihapus. Kalau
    // kurs benar-benar tidak tersedia, konversi TIDAK dilakukan sama sekali dan field
    // berbasis USD dibiarkan null - lebih baik "N/A" daripada rupiah hasil kurs karangan.
    const exchangeRate = priceCurrency === 'IDR' && finCurrency === 'USD' ? await getUsdIdrRate() : null;
    if (priceCurrency === 'IDR' && finCurrency === 'USD' && exchangeRate != null) {
       if (quoteSummary.defaultKeyStatistics) {
         if (quoteSummary.defaultKeyStatistics.bookValue) quoteSummary.defaultKeyStatistics.bookValue *= exchangeRate;
       }
       if (quoteSummary.financialData) {
         if (quoteSummary.financialData.freeCashflow) quoteSummary.financialData.freeCashflow *= exchangeRate;
         if (quoteSummary.financialData.operatingCashflow) quoteSummary.financialData.operatingCashflow *= exchangeRate;
         if (quoteSummary.financialData.totalRevenue) quoteSummary.financialData.totalRevenue *= exchangeRate;
         if (quoteSummary.financialData.grossProfits) quoteSummary.financialData.grossProfits *= exchangeRate;
         if (quoteSummary.financialData.totalCash) quoteSummary.financialData.totalCash *= exchangeRate;
         if (quoteSummary.financialData.totalDebt) quoteSummary.financialData.totalDebt *= exchangeRate;
       }

       // Recalculate PBV saja (BVPS baru saja dikonversi ke IDR di atas). PER TIDAK
       // dihitung ulang - summaryDetail.trailingPE/forwardPE dari Yahoo sudah benar
       // (EPS sudah IDR sejak awal).
       if (currentPrice > 0 && quoteSummary.defaultKeyStatistics?.bookValue) {
         quoteSummary.defaultKeyStatistics.priceToBook = currentPrice / quoteSummary.defaultKeyStatistics.bookValue;
       }
    } else if (priceCurrency === 'IDR' && finCurrency === 'USD') {
      // Emiten pelapor USD TAPI kurs tidak tersedia: field yang satuannya USD dikosongkan
      // supaya tidak dirender sebagai rupiah. priceToBook mentah Yahoo untuk emiten ini
      // membandingkan harga IDR dengan book value USD (diverifikasi live: ADRO 14.823x)
      // - itu angka salah satuan, bukan sekadar kurang presisi.
      if (quoteSummary.defaultKeyStatistics) {
        quoteSummary.defaultKeyStatistics.bookValue = null;
        quoteSummary.defaultKeyStatistics.priceToBook = null;
      }
      if (quoteSummary.financialData) {
        quoteSummary.financialData.freeCashflow = null;
        quoteSummary.financialData.operatingCashflow = null;
        quoteSummary.financialData.totalRevenue = null;
        quoteSummary.financialData.grossProfits = null;
        quoteSummary.financialData.totalCash = null;
        quoteSummary.financialData.totalDebt = null;
      }
    }
    // ------------------------------------------------

    // Run all 13 fundamental analyzers
    const analyzersResult = await Promise.all([
      Promise.resolve(analyzePe(quoteSummary)),
      Promise.resolve(analyzePbv(quoteSummary)),
      Promise.resolve(analyzeRoe(quoteSummary)),
      Promise.resolve(analyzeRoa(quoteSummary)),
      Promise.resolve(analyzeDer(quoteSummary)),
      Promise.resolve(analyzeCurrentRatio(quoteSummary)),
      Promise.resolve(analyzeQuickRatio(quoteSummary)),
      Promise.resolve(analyzeDividend(quoteSummary)),
      Promise.resolve(analyzeEpsGrowth(quoteSummary)),
      Promise.resolve(analyzeRevenueGrowth(quoteSummary)),
      Promise.resolve(analyzeGrossMargin(quoteSummary)),
      Promise.resolve(analyzeOperatingMargin(quoteSummary)),
      Promise.resolve(analyzeNetMargin(quoteSummary))
    ]);

    let bullish = 0;
    let bearish = 0;
    let bestPerformer = analyzersResult[0];

    analyzersResult.forEach(res => {
      if (res.decision === 'BULLISH') bullish++;
      else if (res.decision === 'BEARISH') bearish++;

      if (res.confidence > bestPerformer.confidence) {
        bestPerformer = res;
      }
    });

    // BUG FIX (audit skor fundamental 2026-08-05, laporan user - KOTA.JK dilabeli
    // "UNDERVALUED" di sini padahal Intrinsic Value bilang overvalued 253%): vote
    // 13-analyzer di atas menjawab "bisnisnya bagus atau buruk" (kualitas), BUKAN
    // "sahamnya murah atau mahal" (valuasi) - cuma 2 dari 13 (PE, PBV) yang benar-benar
    // mengukur valuasi, jadi label lama bisa TERBALIK saat 11 analyzer kualitas menang
    // suara dari 2 analyzer valuasi. Dua pertanyaan sekarang dijawab terpisah - lihat
    // catatan lengkap di modules/fundamental/service/consensus-labels.service.ts.
    const fundamentalQuality = computeFundamentalQuality(bullish, bearish);

    // Valuasi (murah/mahal) dari margin of safety hasil calculateIntrinsicValue() - metode
    // absolut (Graham Number/PER Fair/PBV Fair/DCF sesuai bobot sektor, sama seperti yang
    // dipakai Intrinsic Value), BUKAN vote mayoritas. Fetch terpisah (bukan reuse
    // quoteSummary di atas) karena calculateIntrinsicValue() butuh modul tambahan
    // (financialData lengkap) - try/catch supaya kegagalannya tidak menjatuhkan seluruh
    // endpoint, cukup melaporkan valuasi sebagai data tidak cukup.
    let consensus = 'DATA TIDAK CUKUP';
    try {
      const intrinsic = await calculateIntrinsicValue(ticker);
      if (intrinsic) {
        consensus = computeValuationLabel(intrinsic.mos, intrinsic.fair_value);
      }
    } catch (e) {
      console.warn(`[Fundamental] calculateIntrinsicValue gagal untuk ${ticker} - valuasi dilaporkan sebagai data tidak cukup`, e);
    }

    let descriptionId = quoteSummary.assetProfile?.longBusinessSummary || 'Tidak ada deskripsi perusahaan.';
    if (quoteSummary.assetProfile?.longBusinessSummary) {
      try {
        const text = quoteSummary.assetProfile.longBusinessSummary;
        const sliced = text.length > 2000 ? text.slice(0, 2000) + '...' : text;
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=id&dt=t&q=${encodeURIComponent(sliced)}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json && json[0]) {
          descriptionId = json[0].map((x: any) => x[0]).join('');
        }
      } catch (e) {
        // Fallback to english if translation fails
      }
    }

    return NextResponse.json({
      ticker,
      price: currentPrice,
      analyzers: analyzersResult,
      consensus,
      // Label kualitas bisnis (BAGUS/BURUK/NETRAL) TERPISAH dari `consensus` (valuasi
      // murah/mahal) - lihat catatan di atas & consensus-labels.service.ts.
      fundamentalQuality,
      bestPerformer,
      stock: {
        symbol: ticker,
        current_price: currentPrice,
        name: quoteSummary.price?.longName || quoteSummary.price?.shortName || ticker,
        change_pct: quoteSummary.price?.regularMarketChangePercent ? parseFloat((quoteSummary.price.regularMarketChangePercent * 100).toFixed(2)) : 0,
        volume: quoteSummary.price?.regularMarketVolume || 0
      },
      profile: {
        sector: quoteSummary.assetProfile?.sector || 'N/A',
        industry: quoteSummary.assetProfile?.industry || 'N/A',
        description: descriptionId,
        website: quoteSummary.assetProfile?.website || ''
      },
      // BUG FIX (audit logika & algoritma 2026-08-05, temuan H-13): ke-13 field di bawah
      // SEBELUMNYA pakai `|| 0`. Untuk data finansial, 0 BUKAN "tidak tersedia" - "PER 0"
      // dan "ROE 0%" adalah pernyataan tentang perusahaan yang bisa keliru dipercaya
      // pengguna (bank tidak mengirim debtToEquity ke Yahoo, emiten rugi tidak punya
      // trailingPE). Sekarang `null`, dan UI menampilkan "N/A".
      fundamentals: {
        marketCap: quoteSummary.summaryDetail?.marketCap ?? quoteSummary.price?.marketCap ?? null,
        trailingPE: quoteSummary.summaryDetail?.trailingPE ?? null,
        forwardPE: quoteSummary.summaryDetail?.forwardPE ?? null,
        priceToBook: quoteSummary.defaultKeyStatistics?.priceToBook ?? null,
        returnOnEquity: quoteSummary.financialData?.returnOnEquity ?? null,
        returnOnAssets: quoteSummary.financialData?.returnOnAssets ?? null,
        debtToEquity: quoteSummary.financialData?.debtToEquity ?? null,
        totalRevenue: quoteSummary.financialData?.totalRevenue ?? null,
        ebitda: quoteSummary.financialData?.ebitda ?? null,
        profitMargins: quoteSummary.financialData?.profitMargins ?? null,
        dividendYield: quoteSummary.summaryDetail?.dividendYield ?? null,
        grossMargins: quoteSummary.financialData?.grossMargins ?? null,
        // Dulu ada fallback angka karangan (0.0546/0.055) kalau Yahoo tidak punya NIM -
        // dihapus sejak audit sebelumnya; sekarang null, bukan 0.
        nim: quoteSummary.financialData?.netInterestMargin ?? null
      }
    });

  } catch (error: any) {
    console.error('Fundamental API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
