import { NextRequest, NextResponse } from 'next/server';
import { runDailyCloseReconciliation } from '@/modules/market-data-integrity/service/close-reconciliation.service';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';

export const runtime = 'nodejs';
export const maxDuration = 900;

async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && timingSafeStringEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

async function handleGET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await withJobRunLog('market-data-reconcile', async () => {
      const guarded = await runWithJobConcurrencyGuard('market-data-reconcile', runDailyCloseReconciliation, 20 * 60);
      return guarded.executed ? guarded.value : { status: 'SKIPPED', reason: 'job_already_running' };
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ error: 'Market data reconciliation gagal', detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}
