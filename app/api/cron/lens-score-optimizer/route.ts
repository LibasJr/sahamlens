import { NextRequest, NextResponse } from 'next/server';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { runLensScoreOptimizer } from '@/modules/lens-radar/service/lens-score-optimizer.service';

export const maxDuration = 300;

function isAuthorizedCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return req.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    logger.warn('Menolak request /api/cron/lens-score-optimizer - CRON_SECRET tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('lens-score-optimizer', async () => runLensScoreOptimizer());
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job lens-score-optimizer gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}
