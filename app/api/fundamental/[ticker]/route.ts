import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';

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
} from '@/modules/fundamental';

export async function GET(
  request: Request,
  { params }: { params: { ticker: string } }
) {
  try {
    let ticker = params.ticker.toUpperCase();
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

    if (priceCurrency === 'IDR' && finCurrency === 'USD') {
       let exchangeRate = 15500;
       try {
         const fx = await yahooFinance.quote('USDIDR=X');
         if (fx && fx.regularMarketPrice) exchangeRate = fx.regularMarketPrice;
       } catch(e) {}

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

    const totalVotes = bullish + bearish;
    let consensus = 'NEUTRAL';
    
    if (totalVotes > 0) {
      const bullPct = (bullish / totalVotes) * 100;
      if (bullPct >= 60) consensus = `UNDERVALUED (BULLISH ${bullPct.toFixed(0)}%)`;
      else if (bullPct <= 40) consensus = `OVERVALUED (BEARISH ${(100 - bullPct).toFixed(0)}%)`;
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
      fundamentals: {
        marketCap: quoteSummary.summaryDetail?.marketCap || quoteSummary.price?.marketCap || 0,
        trailingPE: quoteSummary.summaryDetail?.trailingPE || 0,
        forwardPE: quoteSummary.summaryDetail?.forwardPE || 0,
        priceToBook: quoteSummary.defaultKeyStatistics?.priceToBook || 0,
        returnOnEquity: quoteSummary.financialData?.returnOnEquity || 0,
        returnOnAssets: quoteSummary.financialData?.returnOnAssets || 0,
        debtToEquity: quoteSummary.financialData?.debtToEquity || 0,
        totalRevenue: quoteSummary.financialData?.totalRevenue || 0,
        ebitda: quoteSummary.financialData?.ebitda || 0,
        profitMargins: quoteSummary.financialData?.profitMargins || 0,
        dividendYield: quoteSummary.summaryDetail?.dividendYield || 0,
        // Gross margin fallback for non-banks if needed by UI
        grossMargins: quoteSummary.financialData?.grossMargins || 0,
        // Dulu ada fallback angka karangan (0.0546/0.055) kalau Yahoo tidak punya NIM -
        // dihapus, biarkan 0/falsy supaya UI tampil "N/A" jujur (lihat app/fundamental/
        // page.tsx) daripada angka tebakan yang dikira data asli.
        nim: quoteSummary.financialData?.netInterestMargin || 0
      }
    });

  } catch (error: any) {
    console.error('Fundamental API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
