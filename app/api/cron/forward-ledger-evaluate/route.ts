import { NextRequest, NextResponse } from 'next/server';
import { evaluateForwardOutcomes } from '@/modules/decision-agent';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { logger } from '@/shared/logger/logger';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';

export const maxDuration = 300;

async function handleGET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !timingSafeStringEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const maxSignalsParam = url.searchParams.get('max');
  const maxSignals = maxSignalsParam ? Number.parseInt(maxSignalsParam, 10) : undefined;

  try {
    const guarded = await runWithJobConcurrencyGuard('forward-ledger-evaluate', () =>
      withJobRunLog('forward-ledger-evaluate', () => evaluateForwardOutcomes({ maxSignals })),
    );

    if (!guarded.executed) {
      return NextResponse.json({ success: true, skipped: true, reason: guarded.reason }, { status: 202 });
    }

    return NextResponse.json({ success: true, result: guarded.value });
  } catch (error) {
    logger.error('Job forward-ledger-evaluate gagal', { err: error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Job forward-ledger-evaluate gagal' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}
