import { NextRequest, NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { logger } from '@/shared/logger/logger';
import { AI_PICK_UNIVERSE } from '@/modules/market/constants/ai-pick-universe';
import { writeFundamentalSnapshot, type FundamentalSnapshot } from '@/shared/cache/ai-pick-cache';
import { archiveFundamentalSnapshotSafe } from '@/modules/fundamental/repository/fundamental-history.repository';
import { correctPbvForUsdReporter } from '@/shared/market/usd-idr-rate';
import {
  runFundamentalCrossCheck,
  type CrossCheckSummary,
} from '@/modules/fundamental/service/fundamental-cross-check-runner.service';
import { todayDateKeyWIB } from '@/shared/market/trading-session';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';

export const maxDuration = 300;

// Pola instansiasi sama dengan modules/recommendation/service/recommendation.service.ts:17 -
// tipe bawaan quoteSummary() menyempit ke `never` untuk kombinasi modules ini, jadi klien
// dibuat lewat cast seperti di kode yang sudah ada, bukan import default bertipe.
const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

// Dijalankan HARIAN, bukan tiap 5 menit - lihat alasan TTL di shared/cache/ai-pick-cache.ts.
// Satu saham gagal tidak menggagalkan seluruh job (pola sama dengan precompute backtest):
// saham itu masuk snapshot dengan nilai null, dan calculateScore() sudah menangani null
// dengan memberi skor 0 + alasan "DATA TIDAK LENGKAP".
const BATCH_SIZE = 15;

async function fetchOne(ticker: string) {
  try {
    const qs = await yahooFinance.quoteSummary(ticker, {
      // `assetProfile` ditambahkan (P1-10/P1-11): tanpa sektor, AI Pick menilai valuasi
      // & kesehatan neraca setiap emiten dengan perlakuan netral - bank tetap dinilai
      // lewat DER, emiten komoditas tetap kebal penjaga puncak siklus.
      modules: ['assetProfile', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'price'],
    });
    return {
      per: qs?.summaryDetail?.trailingPE || qs?.summaryDetail?.forwardPE || null,
      // BUG FIX (audit cross-check XBRL vs Yahoo, 2026-09-14): `priceToBook` mentah untuk
      // emiten pelapor USD membandingkan harga IDR dengan nilai buku USD, jadi angka yang
      // tersimpan sebenarnya KURS, bukan rasio. Terukur di `fundamental_history`
      // 2026-09-12: ADRO 16500, AADI 28563, AMMN 63947 - 38 dari 200 emiten (19%) punya
      // pbv > 50.
      //
      // Koreksinya sudah ada sejak audit 2026-08-03 (temuan C-07) dan dipakai di
      // recommendation.service.ts, tapi jalur snapshot ini tidak ikut dilindungi -
      // penjaga yang hanya menutup satu dari dua jalur. `price` sudah ikut diminta di
      // daftar modules di atas, jadi koreksi ini tidak menambah biaya fetch.
      pbv: await correctPbvForUsdReporter({
        priceCurrency: qs?.price?.currency,
        financialCurrency: qs?.financialData?.financialCurrency,
        bookValue: qs?.defaultKeyStatistics?.bookValue,
        price: qs?.price?.regularMarketPrice,
        rawPbv: qs?.defaultKeyStatistics?.priceToBook || null,
      }),
      roe: qs?.financialData?.returnOnEquity != null ? qs.financialData.returnOnEquity * 100 : null,
      der: qs?.financialData?.debtToEquity != null ? qs.financialData.debtToEquity / 100 : null,
      currentRatio: qs?.financialData?.currentRatio || null,
      revenueGrowth: qs?.financialData?.revenueGrowth != null ? qs.financialData.revenueGrowth * 100 : null,
      sharesOutstanding: typeof qs?.defaultKeyStatistics?.sharesOutstanding === 'number' ? qs.defaultKeyStatistics.sharesOutstanding : null,
      marketCap: typeof qs?.price?.marketCap === 'number' ? qs.price.marketCap : null,
      sector: {
        yahooSector: qs?.assetProfile?.sector ?? null,
        yahooIndustry: qs?.assetProfile?.industry ?? null,
        payoutRatio: qs?.summaryDetail?.payoutRatio ?? null,
        beta: null,
      },
    };
  } catch {
    logger.warn('Snapshot fundamental: gagal fetch', { ticker });
    return { per: null, pbv: null, roe: null, der: null, currentRatio: null, revenueGrowth: null, sharesOutstanding: null, marketCap: null };
  }
}

async function handlePOST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const authorization = req.headers.get('authorization');
  const rawBody = await req.text();

  if (!(await verifyQStashSignature(signature, rawBody, authorization))) {
    logger.warn('Menolak request /api/cron/fundamental-snapshot - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const guarded = await runWithJobConcurrencyGuard('fundamental-snapshot', () => withJobRunLog('fundamental-snapshot', async () => {
      const snapshot: FundamentalSnapshot = {};
      for (let i = 0; i < AI_PICK_UNIVERSE.length; i += BATCH_SIZE) {
        const batch = AI_PICK_UNIVERSE.slice(i, i + BATCH_SIZE);
        const values = await Promise.all(batch.map(fetchOne));
        batch.forEach((ticker, idx) => { snapshot[ticker] = values[idx]; });
      }
      await writeFundamentalSnapshot(snapshot);

      // ARSIP POINT-IN-TIME (P0-5). Cache di atas TETAP ditulis seperti sebelumnya -
      // ia melayani runtime (AI Pick scan membacanya tiap 5 menit). Arsip di bawah
      // lapisan TERPISAH: append-only per (ticker, observed_date), supaya nilai hari
      // ini masih bisa dibaca berbulan-bulan lagi. Tanpa ini setiap hari yang lewat
      // hilang permanen karena cache Redis ber-TTL 24 jam selalu ditimpa.
      //
      // observed_date = tanggal kalender WIB, BUKAN new Date() server (Vercel jalan
      // di UTC - cron 07:00 WIB akan terarsip sebagai tanggal H-1 kalau memakai UTC).
      //
      // Ticker disimpan APA ADANYA (dengan sufiks .JK) supaya kunci arsip identik
      // dengan kunci snapshot cache & AI_PICK_UNIVERSE - tidak ada normalisasi diam-
      // diam yang bisa membuat dua konvensi ticker hidup berdampingan di satu tabel.
      const observedDate = todayDateKeyWIB();
      const archive = await archiveFundamentalSnapshotSafe(
        Object.entries(snapshot).map(([ticker, f]) => ({ ticker, observedDate, ...f }))
      );
      if (archive.error) {
        logger.warn('Snapshot fundamental: cache tertulis, arsip historis GAGAL', {
          observedDate, err: archive.error,
        });
      }

      // Cross-check XBRL resmi BEI lawan angka Yahoo yang baru saja disimpan.
      //
      // TIDAK mengubah satu pun nilai yang dipakai LensScore - hanya mencatat
      // perbedaannya. Mengganti sumber data dan mengubah skor sekaligus membuat
      // mustahil membedakan "skor berubah karena data lebih benar" dari "skor berubah
      // karena parser XBRL punya bug".
      //
      // Dibungkus try/catch sendiri: pembanding yang bisa menjatuhkan job snapshot akan
      // dicopot orang pada insiden pertama, dan saat itu perlindungannya hilang diam-diam.
      let crossCheck: CrossCheckSummary | null = null;
      try {
        crossCheck = runFundamentalCrossCheck(snapshot);
        logger.info('Cross-check fundamental XBRL vs Yahoo', { observedDate, ...crossCheck });
      } catch (err) {
        logger.warn('Cross-check fundamental gagal seluruhnya', {
          observedDate, err: err instanceof Error ? err.message : String(err),
        });
      }

      return {
        tickers: Object.keys(snapshot).length,
        observedDate,
        archivedRows: archive.archived,
        archiveError: archive.error,
        crossCheck,
      };
    }));
    if (!guarded.executed) {
      return NextResponse.json({ success: true, skipped: true, reason: guarded.reason }, { status: 202 });
    }
    const result = guarded.value;
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job fundamental-snapshot gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return runCronRoute(req, () => handlePOST(req));
}
