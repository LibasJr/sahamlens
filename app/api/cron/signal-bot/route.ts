import { NextRequest, NextResponse } from 'next/server';
import { runDecisionAgentScan } from '@/modules/decision-agent';
import { sendSignalBatch } from '@/modules/notification/service/telegram-signal.service';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';
import { logger } from '@/shared/logger/logger';

export const maxDuration = 300;

/**
 * Bot sinyal trading SahamLens → Telegram.
 *
 * Menjalankan Decision Agent scan, memfilter sinyal BUY_CANDIDATE dengan
 * RR >= 1.8 dan LensScore >= 70, lalu mengirim ringkasan + detail ke Telegram.
 */
async function runSignalBot(chatId?: string) {
  const run = await runDecisionAgentScan({
    trigger: 'SCHEDULED',
    persist: false,
    hybrid: false,
  });

  if (!run) {
    return { sent: 0, reason: 'no_run' };
  }

  const actionable = run.signals.filter((s) => s.action !== 'NO_SIGNAL');
  if (actionable.length === 0) {
    return { sent: 0, reason: 'no_actionable_signals', total: run.signals.length };
  }

  // Filter detail: hanya BUY_CANDIDATE qualified yang dikirim detail-nya
  const signalsForSend = actionable.map((s) => ({
    ...s,
    riskSetup:
      s.action === 'BUY_CANDIDATE' &&
      s.lensScore >= 70 &&
      s.riskSetup &&
      s.riskSetup.riskReward >= 1.8
        ? s.riskSetup
        : null,
  }));

  const qualified = actionable.filter(
    (s) =>
      s.action === 'BUY_CANDIDATE' &&
      s.lensScore >= 70 &&
      s.riskSetup &&
      s.riskSetup.riskReward >= 1.8,
  );

  const result = await sendSignalBatch(signalsForSend, run.dataAsOf, chatId);

  return {
    total: run.signals.length,
    buyCandidates: run.summary.buyCandidates,
    qualified: qualified.length,
    sent: result.sent,
    failed: result.failed,
  };
}

async function handleGET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !timingSafeStringEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const chatId = new URL(req.url).searchParams.get('chatId') ?? undefined;

  try {
    const guarded = await runWithJobConcurrencyGuard('signal-bot', () =>
      withJobRunLog('signal-bot', () => runSignalBot(chatId)),
    );
    if (!guarded.executed) {
      return NextResponse.json({ success: true, skipped: true, reason: guarded.reason }, { status: 202 });
    }
    return NextResponse.json({ success: true, result: guarded.value });
  } catch (error) {
    logger.error('Job signal-bot gagal', { err: error });
    return NextResponse.json({ error: 'Job signal-bot gagal' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}
