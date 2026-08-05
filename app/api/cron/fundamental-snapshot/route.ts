import { NextRequest, NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { AI_PICK_UNIVERSE } from '@/modules/market/constants/ai-pick-universe';
import { writeFundamentalSnapshot, type FundamentalSnapshot } from '@/shared/cache/ai-pick-cache';
import { archiveFundamentalSnapshotSafe } from '@/modules/fundamental/repository/fundamental-history.repository';
import { todayDateKeyWIB } from '@/shared/market/trading-session';

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
      modules: ['assetProfile', 'summaryDetail', 'defaultKeyStatistics', 'financialData'],
    });
    return {
      per: qs?.summaryDetail?.trailingPE || qs?.summaryDetail?.forwardPE || null,
      pbv: qs?.defaultKeyStatistics?.priceToBook || null,
      roe: qs?.financialData?.returnOnEquity != null ? qs.financialData.returnOnEquity * 100 : null,
      der: qs?.financialData?.debtToEquity != null ? qs.financialData.debtToEquity / 100 : null,
      currentRatio: qs?.financialData?.currentRatio || null,
      revenueGrowth: qs?.financialData?.revenueGrowth != null ? qs.financialData.revenueGrowth * 100 : null,
      sector: {
        yahooSector: qs?.assetProfile?.sector ?? null,
        yahooIndustry: qs?.assetProfile?.industry ?? null,
        payoutRatio: qs?.summaryDetail?.payoutRatio ?? null,
        beta: null,
      },
    };
  } catch {
    logger.warn('Snapshot fundamental: gagal fetch', { ticker });
    return { per: null, pbv: null, roe: null, der: null, currentRatio: null, revenueGrowth: null };
  }
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  if (!(await verifyQStashSignature(signature, rawBody))) {
    logger.warn('Menolak request /api/cron/fundamental-snapshot - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('fundamental-snapshot', async () => {
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

      return {
        tickers: Object.keys(snapshot).length,
        observedDate,
        archivedRows: archive.archived,
        archiveError: archive.error,
      };
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job fundamental-snapshot gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}
