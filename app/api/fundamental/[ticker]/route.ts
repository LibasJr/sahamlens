import { asOf } from '@/modules/fundamental/repository/fundamental-history.repository';
import { fundamentalPitToAnalyzerPayload } from '@/modules/fundamental/service/fundamental-pit-adapter';
import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { fetchCurrentFundamentalSource } from '@/modules/fundamental/service/current-fundamental-source.service';

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
import { scoreFundamentalDataQuality } from '@/modules/validation';

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

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


    // ============================================================
    // FUNDAMENTAL POINT-IN-TIME HISTORICAL MODE
    // ?as_of=YYYY-MM-DD
    // ============================================================
    const url = new URL(request.url);
    const asOfDate = url.searchParams.get('as_of');

    if (asOfDate !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
        return NextResponse.json(
          { error: 'as_of wajib format YYYY-MM-DD' },
          { status: 400 },
        );
      }

      console.log('[PIT ROUTE TEST]', ticker, asOfDate);

      const pit = await asOf(ticker, asOfDate);

      if (!pit) {
        return NextResponse.json(
          {
            ticker,
            mode: 'PIT',
            requested_as_of: asOfDate,
            available: false,
            message: 'Belum ada fundamental yang diketahui pasar pada tanggal tersebut.',
          },
          { status: 404 },
        );
      }

      const pitPayload = fundamentalPitToAnalyzerPayload(pit);

      const analyzersResult = await Promise.all([
        Promise.resolve(analyzePe(pitPayload)),
        Promise.resolve(analyzePbv(pitPayload)),
        Promise.resolve(analyzeRoe(pitPayload)),
        Promise.resolve(analyzeRoa(pitPayload)),
        Promise.resolve(analyzeDer(pitPayload)),
        Promise.resolve(analyzeCurrentRatio(pitPayload)),
        Promise.resolve(analyzeQuickRatio(pitPayload)),
        Promise.resolve(analyzeDividend(pitPayload)),
        Promise.resolve(analyzeEpsGrowth(pitPayload)),
        Promise.resolve(analyzeRevenueGrowth(pitPayload)),
        Promise.resolve(analyzeGrossMargin(pitPayload)),
        Promise.resolve(analyzeOperatingMargin(pitPayload)),
        Promise.resolve(analyzeNetMargin(pitPayload)),
      ]);

      let bullish = 0;
      let bearish = 0;
      let bestPerformer = analyzersResult[0];

      for (const result of analyzersResult) {
        if (result.decision === 'BULLISH') bullish++;
        else if (result.decision === 'BEARISH') bearish++;

        if (result.confidence > bestPerformer.confidence) {
          bestPerformer = result;
        }
      }

      const fundamentalQuality =
        computeFundamentalQuality(bullish, bearish);

      return NextResponse.json({
        ticker,
        mode: 'PIT',
        requested_as_of: asOfDate,
        available: true,

        pit: {
          observed_date: pit.observedDate,
          period_end: pit.periodEnd,
        },

        price: null,
        analyzers: analyzersResult,
        fundamentalQuality,
        bestPerformer,

        consensus:
          'DATA PIT HISTORIS - valuasi current tidak digunakan',

        fundamentals: {
          marketCap: null,
          trailingPE: pit.per,
          forwardPE: null,
          priceToBook: pit.pbv,

          returnOnEquity:
            pit.roe == null ? null : pit.roe / 100,

          returnOnAssets: null,

          debtToEquity:
            pit.der == null ? null : pit.der * 100,

          currentRatio: pit.currentRatio,

          revenueGrowth:
            pit.revenueGrowth == null
              ? null
              : pit.revenueGrowth / 100,

          totalRevenue: null,
          ebitda: null,
          profitMargins: null,
          dividendYield: null,
          grossMargins: null,
          operatingMargins: null,
          netProfitMargins: null,
          nim: null,
        },
      });
    }
    // Current fundamental memakai service bersama dengan LensAI supaya koreksi currency
    // mismatch dan sumber angka tidak dapat drift antar endpoint.
    const quoteSummary = await fetchCurrentFundamentalSource(ticker);

    if (!quoteSummary) {
      return NextResponse.json({ error: 'Failed to fetch Fundamental data' }, { status: 404 });
    }

    const currentPrice = isFinitePositive(quoteSummary.price?.regularMarketPrice)
      ? quoteSummary.price.regularMarketPrice
      : null;


    const dataQuality = scoreFundamentalDataQuality({
      price: currentPrice,
      eps: isFiniteNumber(quoteSummary.defaultKeyStatistics?.trailingEps)
        ? quoteSummary.defaultKeyStatistics.trailingEps
        : null,
      bvps: isFiniteNumber(quoteSummary.defaultKeyStatistics?.bookValue)
        ? quoteSummary.defaultKeyStatistics.bookValue
        : null,
      per: isFiniteNumber(quoteSummary.summaryDetail?.trailingPE)
        ? quoteSummary.summaryDetail.trailingPE
        : null,
      pbv: isFiniteNumber(quoteSummary.defaultKeyStatistics?.priceToBook)
        ? quoteSummary.defaultKeyStatistics.priceToBook
        : null,
      roePct: isFiniteNumber(quoteSummary.financialData?.returnOnEquity)
        ? quoteSummary.financialData.returnOnEquity * 100
        : null,
    });

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
      dataQuality,
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
        change_pct: isFiniteNumber(quoteSummary.price?.regularMarketChangePercent)
          ? parseFloat((quoteSummary.price.regularMarketChangePercent * 100).toFixed(2))
          : null,
        volume: isFiniteNonNegative(quoteSummary.price?.regularMarketVolume)
          ? quoteSummary.price.regularMarketVolume
          : null
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

