import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { logger } from '@/shared/logger/logger';
import { precomputeBacktestData, writeBacktestCache } from '@/modules/backtest';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';

export const maxDuration = 60;

// Cron harian (didaftarkan sebagai QStash schedule terpisah, lihat docs/operations/DEPLOYMENT.md) -
// mengisi ulang cache indikator harian utk 100 saham universe backtest + IHSG.
// Tanpa ini jalan (atau kalau baru pertama kali deploy), /api/backtest fallback ke
// precompute sinkron langsung di request (lambat, lihat app/api/backtest/route.ts).
async function handlePOST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/backtest-precompute - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const guarded = await runWithJobConcurrencyGuard('backtest-precompute', () => withJobRunLog('backtest-precompute', async () => {
      const data = await precomputeBacktestData();
      await writeBacktestCache(data);
      return { tickers: data.tickers.length, computedAt: data.computedAt };
    }));
    if (!guarded.executed) {
      return NextResponse.json({ success: true, skipped: true, reason: guarded.reason }, { status: 202 });
    }
    const result = guarded.value;
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job backtest-precompute gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return runCronRoute(req, () => handlePOST(req));
}
