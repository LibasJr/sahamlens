import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/shared/logger/logger';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { recomputeTpclValidationDashboard } from '@/app/api/admin/tpcl-validation/cache';
import {
  claimNextTpclValidationRun,
  completeTpclValidationRun,
  failTpclValidationRun,
} from '@/modules/recommendation/repository/tpcl-validation-run.repository';
import type { TpclValidationDashboard } from '@/modules/recommendation/service/tpcl-validation.service';

export const runtime = 'nodejs';
export const maxDuration = 900;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && timingSafeStringEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

function fingerprint(d: TpclValidationDashboard): string {
  return createHash('sha256')
    .update(JSON.stringify({
      protocolVersion: d.protocolVersion,
      historyRange: d.historyRange,
      scoreVersion: d.scoreVersion,
      rawSignalRows: d.rawSignalRows,
      firstSignalDate: d.firstSignalDate,
      lastSignalDate: d.lastSignalDate,
      parameters: d.forwardOos.parameterFingerprint,
    }))
    .digest('hex');
}

async function processOne() {
  const run = await claimNextTpclValidationRun();
  if (!run) return { status: 'IDLE' as const, processed: 0 };

  try {
    const dashboard = await recomputeTpclValidationDashboard(run.historyRange);
    await completeTpclValidationRun(run.id, dashboard, fingerprint(dashboard));
    logger.info('TPCL Validation worker selesai', { runId: run.id, historyRange: run.historyRange });
    return { status: 'SUCCESS' as const, processed: 1, runId: run.id, historyRange: run.historyRange };
  } catch (error) {
    await failTpclValidationRun(run.id, error).catch(() => undefined);
    throw error;
  }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await withJobRunLog('tpcl-validation-worker', async () => {
      const guarded = await runWithJobConcurrencyGuard('tpcl-validation-worker', processOne, 20 * 60);
      return guarded.executed ? guarded.value : { status: 'SKIPPED' as const, processed: 0, reason: 'job_already_running' };
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    logger.error('TPCL Validation worker gagal', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'TPCL Validation worker gagal' }, { status: 500 });
  }
}
