import { NextRequest, NextResponse } from 'next/server';
import { executeShadowLenganB } from '@/modules/decision-agent';
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
  const explicitDate = url.searchParams.get('date') ?? undefined;
  const dryRun = url.searchParams.get('dry_run') === 'true';
  const bypassRegime = url.searchParams.get('bypass_regime') === 'true';

  try {
    const guarded = await runWithJobConcurrencyGuard('shadow-lengan-b-record', () =>
      withJobRunLog('shadow-lengan-b-record', () =>
        executeShadowLenganB({ date: explicitDate, dryRun, bypassRegime }),
      ),
    );

    if (!guarded.executed) {
      return NextResponse.json({ success: true, skipped: true, reason: guarded.reason }, { status: 202 });
    }

    return NextResponse.json({ success: true, result: guarded.value });
  } catch (error) {
    logger.error('Job shadow-lengan-b-record gagal', { err: error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Job shadow-lengan-b-record gagal' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}
