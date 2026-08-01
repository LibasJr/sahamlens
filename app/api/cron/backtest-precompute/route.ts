import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { precomputeBacktestData, writeBacktestCache } from '@/modules/backtest';

export const maxDuration = 60;

// Cron harian (didaftarkan sebagai QStash schedule terpisah, lihat DEPLOYMENT.md) -
// mengisi ulang cache indikator harian utk 100 saham universe backtest + IHSG.
// Tanpa ini jalan (atau kalau baru pertama kali deploy), /api/backtest fallback ke
// precompute sinkron langsung di request (lambat, lihat app/api/backtest/route.ts).
export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/backtest-precompute - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('backtest-precompute', async () => {
      const data = await precomputeBacktestData();
      await writeBacktestCache(data);
      return { tickers: data.tickers.length, computedAt: data.computedAt };
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job backtest-precompute gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}
