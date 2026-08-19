import { asOf } from '@/modules/fundamental/repository/fundamental-history.repository';
import { getBankFundamentalAsOf } from '@/modules/fundamental/repository/bank-fundamental.repository';
import { assessBankFundamentalQuality } from '@/modules/fundamental/service/bank-fundamental-quality.service';
import { fundamentalPitToAnalyzerPayload } from '@/modules/fundamental/service/fundamental-pit-adapter';
import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { NotFoundError } from '@/shared/errors/app-error';
import { z } from 'zod';
import { idxTickerParamSchema } from '@/shared/market/ticker-schema';
import { fetchCurrentFundamentalSource } from '@/modules/fundamental/service/current-fundamental-source.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

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
import { fetchNormalizedEarnings } from '@/modules/fundamental/service/normalized-earnings.service';
import { buildMoatDurability } from '@/modules/fundamental/service/moat-durability.service';

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
  return runController(async () => {
    const { ticker: rawTicker } = await params;
    const ticker = parseOrThrow(idxTickerParamSchema, rawTicker);


    // ============================================================
    // FUNDAMENTAL POINT-IN-TIME HISTORICAL MODE
    // ?as_of=YYYY-MM-DD
    // ============================================================
    const url = new URL(request.url);
    const asOfDate = url.searchParams.get('as_of');

    if (asOfDate !== null) {
      // Regex tangan -> skema Zod lewat parseOrThrow. Bentuk 400-nya sama, tapi sekarang
      // membawa `code: 'VALIDATION_ERROR'` dari katalog, jadi klien bisa menanganinya
      // bersama kegagalan validasi lain alih-alih mencocokkan string pesan.
      parseOrThrow(
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'as_of wajib format YYYY-MM-DD'),
        asOfDate,
      );

      console.log('[PIT ROUTE TEST]', ticker, asOfDate);

      const pit = await asOf(ticker, asOfDate);

      if (!pit) {
        // 404 dengan BODY BERMAKNA, bukan amplop error: `available: false` berikut
        // pesannya adalah jawaban yang UI tampilkan apa adanya ("belum ada fundamental
        // yang diketahui pasar pada tanggal itu"). Melemparnya sebagai NotFoundError
        // akan menggantinya dengan { error, code } dan menghapus konteks tanggalnya.
        return {
          status: 404,
          body: {
            ticker,
            mode: 'PIT',
            requested_as_of: asOfDate,
            available: false,
            message: 'Belum ada fundamental yang diketahui pasar pada tanggal tersebut.',
          },
        };
      }

      const [pitPayload, bankFundamentals] = await Promise.all([
        Promise.resolve(fundamentalPitToAnalyzerPayload(pit)),
        getBankFundamentalAsOf(ticker, asOfDate),
      ]);

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

      return { status: 200, body: {
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

        bankFundamentals: bankFundamentals ? { ...bankFundamentals, status: 'DATA_ONLY' as const, quality: assessBankFundamentalQuality(bankFundamentals) } : null,

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
      } };
    }
    // BUG FIX (2026-08-14, laporan pengguna "Fundamental/Moat lambat"): endpoint ini
    // SEBELUMNYA tanpa cache sama sekali - beberapa panggilan Yahoo (quoteSummary,
    // intrinsic value, normalized earnings) DITAMBAH satu panggilan Google Translate,
    // semuanya live di setiap request. getOrCompute (single-flight, TTL sama dengan
    // data teknikal) dipakai supaya buka-tutup tab/timeframe di halaman yang sama
    // tidak membayar ulang seluruh rangkaian ini. Mode PIT (`as_of=`) di atas TIDAK
    // ikut di-cache di sini - satu baca Postgres langsung, sudah murah.
    const result = await getOrCompute(
      `sahamlens:cache:computed:fundamental:${ticker}`,
      CACHE_TTL_SEC.TECHNICAL,
      () => computeCurrentFundamental(ticker),
    );
    if ('notFound' in result) {
      throw new NotFoundError('Data fundamental tidak tersedia untuk emiten ini');
    }
    // catch generik dihapus: runController menghasilkan 500 yang sama sambil mencatat
    // error lengkap ke shared/logger dengan X-Request-Id yang juga diterima klien.
    return { status: 200, body: result };
  });
}

async function computeCurrentFundamental(ticker: string): Promise<Record<string, unknown> | { notFound: true }> {
    // Current fundamental memakai service bersama dengan LensAI supaya koreksi currency
    // mismatch dan sumber angka tidak dapat drift antar endpoint.
    const quoteSummary = await fetchCurrentFundamentalSource(ticker);

    if (!quoteSummary) {
      return { notFound: true };
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
    let costOfEquityPct: number | null = null;
    try {
      const intrinsic = await calculateIntrinsicValue(ticker);
      if (intrinsic) {
        consensus = computeValuationLabel(intrinsic.mos, intrinsic.fair_value);
        // Biaya ekuitas CAPM per emiten, dipakai sebagai MISTAR pilar ketahanan moat -
        // bukan angka tetap. Diambil dari panggilan yang sudah ada, tanpa fetch tambahan.
        costOfEquityPct = typeof intrinsic.assumptions?.cost_of_equity_pct === 'number'
          ? intrinsic.assumptions.cost_of_equity_pct
          : null;
      }
    } catch (e) {
      console.warn(`[Fundamental] calculateIntrinsicValue gagal untuk ${ticker} - valuasi dilaporkan sebagai data tidak cukup`, e);
    }

    // KETAHANAN MOAT. Empat pilar moat yang sudah ada dinilai dari rasio TERKINI, dan
    // moat menurut definisinya adalah soal daya tahan lintas waktu - satu potret mengukur
    // hal yang berbeda dari yang dijanjikan namanya. Deret 4 tahun buku ini yang
    // menjawabnya. `null` kalau tahunnya kurang; halaman menyatakannya sebagai
    // DATA TERBATAS, bukan menilai rendah.
    const annualEarnings = await fetchNormalizedEarnings(ticker).catch(() => null);
    const moatDurability = buildMoatDurability(annualEarnings, costOfEquityPct);
    const bankFundamentals = await getBankFundamentalAsOf(ticker).catch(() => null);

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

    return {
      ticker,
      moatDurability,
      annualEarnings,
      price: currentPrice,
      source: {
        provider: 'Yahoo Finance',
        sourceType: 'PUBLIC_THIRD_PARTY',
        retrievedAt: new Date().toISOString(),
        period: 'Snapshot terbaru yang tersedia',
      },
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
      bankFundamentals: bankFundamentals ? { ...bankFundamentals, status: 'DATA_ONLY' as const, quality: assessBankFundamentalQuality(bankFundamentals) } : null,
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
        currentRatio: quoteSummary.financialData?.currentRatio ?? null,
        quickRatio: quoteSummary.financialData?.quickRatio ?? null,
        revenueGrowth: quoteSummary.financialData?.revenueGrowth ?? null,
        earningsGrowth: quoteSummary.defaultKeyStatistics?.earningsQuarterlyGrowth ?? null,
        totalRevenue: quoteSummary.financialData?.totalRevenue ?? null,
        ebitda: quoteSummary.financialData?.ebitda ?? null,
        profitMargins: quoteSummary.financialData?.profitMargins ?? null,
        dividendYield: quoteSummary.summaryDetail?.dividendYield ?? null,
          payoutRatio: quoteSummary.summaryDetail?.payoutRatio ?? null,
        grossMargins: quoteSummary.financialData?.grossMargins ?? null,
        operatingMargins: quoteSummary.financialData?.operatingMargins ?? null,
        freeCashflow: quoteSummary.financialData?.freeCashflow ?? null,
        operatingCashflow: quoteSummary.financialData?.operatingCashflow ?? null,
        totalDebt: quoteSummary.financialData?.totalDebt ?? null,
        totalCash: quoteSummary.financialData?.totalCash ?? null,
        financialCurrency: quoteSummary.financialData?.financialCurrency ?? null,
        // Dulu ada fallback angka karangan (0.0546/0.055) kalau Yahoo tidak punya NIM -
        // dihapus sejak audit sebelumnya; sekarang null, bukan 0.
        nim: quoteSummary.financialData?.netInterestMargin ?? null
      }
    };
}
