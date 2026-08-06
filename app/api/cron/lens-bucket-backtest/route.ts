import { NextRequest, NextResponse } from 'next/server';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { runAndSaveLensBucketBacktest } from '@/modules/lens-radar/service/bucket-backtest.service';

export const maxDuration = 300;

function isAuthorizedCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return req.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    logger.warn('Menolak request /api/cron/lens-bucket-backtest - CRON_SECRET tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('lens-bucket-backtest', async () => {
      const stats = await runAndSaveLensBucketBacktest();
      return {
        asOfDate: stats.asOfDate,
        scoreVersion: stats.scoreVersion,
        requestedScoreVersion: stats.requestedScoreVersion,
        rejectedRows: stats.rejectedRows,
        unversionedRows: stats.unversionedRows,
        savedRows: stats.savedRows,
        sourceRows: stats.sourceRows,
        uniqueTickers: stats.uniqueTickers,
        skippedGocapRows: stats.skippedGocapRows,
        skippedDrawdownTrades: stats.skippedDrawdownTrades,
        drawdownTrades: stats.drawdownTrades,
      };
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job lens-bucket-backtest gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}
