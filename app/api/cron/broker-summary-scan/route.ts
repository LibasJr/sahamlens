import { NextRequest, NextResponse } from 'next/server';
import { AI_PICK_UNIVERSE } from '@/modules/market/constants/ai-pick-universe';
import { syncIndexAlphaBrokerSummary } from '@/modules/broker-flow/service/index-alpha-broker-summary.service';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { todayDateKeyWIB } from '@/shared/market/trading-session';
import { logger } from '@/shared/logger/logger';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();
  if (!(await verifyQStashSignature(signature, rawBody))) {
    logger.warn('Menolak request /api/cron/broker-summary-scan - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const guarded = await runWithJobConcurrencyGuard('broker-summary-scan', () =>
      withJobRunLog('broker-summary-scan', () => syncIndexAlphaBrokerSummary({
        tickers: AI_PICK_UNIVERSE,
        tradeDate: todayDateKeyWIB(),
      })),
    );
    if (!guarded.executed) {
      return NextResponse.json({ success: true, skipped: true, reason: guarded.reason }, { status: 202 });
    }
    return NextResponse.json({ success: true, skipped: false, result: guarded.value });
  } catch (error) {
    logger.error('Job broker-summary-scan gagal', { error });
    return NextResponse.json({ error: 'Job broker summary gagal' }, { status: 500 });
  }
}
