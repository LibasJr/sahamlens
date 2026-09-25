import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/shared/logger/logger';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';
import { DEFAULT_TPCL_HISTORY_RANGE } from '@/modules/recommendation/service/tpcl-validation.service';
import {
  createTpclValidationRun,
  listRecentTpclValidationRuns,
} from '@/modules/recommendation/repository/tpcl-validation-run.repository';
import { runIntradayValidation } from '@/modules/intraday';
import { listValidationRuns } from '@/modules/intraday/repository/intraday.repository';
import { putuskanSegarkan, SEMINGGU_JAM, stempelTerbaru } from './helpers';

export const runtime = 'nodejs';
export const maxDuration = 900;

const JOB_NAME = 'research-refresh';
const STATUS_SELESAI_TPCL = ['SUCCEEDED', 'FAILED'] as const;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && timingSafeStringEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

async function segarkanTpcl() {
  const runs = await listRecentTpclValidationRuns(20);
  const aktif = runs.filter((r) => r.status === 'QUEUED' || r.status === 'RUNNING').length;
  const terakhir = stempelTerbaru(
    runs.map((r) => ({ selesaiIso: r.finishedAt, status: r.status })),
    STATUS_SELESAI_TPCL
  );
  const keputusan = putuskanSegarkan({
    aktif,
    terakhirSelesaiIso: terakhir,
    sekarang: new Date(),
    maxUmurJam: SEMINGGU_JAM,
  });
  if (keputusan.action !== 'CATAT') {
    return { langkah: 'TPCL', ...keputusan, runId: null, historyRange: null };
  }
  const run = await createTpclValidationRun(DEFAULT_TPCL_HISTORY_RANGE);
  return {
    langkah: 'TPCL',
    action: 'CATAT' as const,
    reason: keputusan.reason,
    umurJam: keputusan.umurJam,
    runId: run.id,
    historyRange: run.historyRange,
  };
}

async function segarkanIntraday() {
  const runs = await listValidationRuns(20);
  const aktif = runs.filter((r) => r.status === 'RUNNING' || r.status === 'QUEUED').length;
  const terakhir = stempelTerbaru(
    runs.map((r) => ({ selesaiIso: r.completedAt ?? r.startedAt, status: r.status })),
    runs.map((r) => r.status)
  );
  const keputusan = putuskanSegarkan({
    aktif,
    terakhirSelesaiIso: terakhir,
    sekarang: new Date(),
    maxUmurJam: SEMINGGU_JAM,
  });
  if (keputusan.action !== 'CATAT') {
    return { langkah: 'INTRADAY', ...keputusan, status: null, sampelEfektif: null };
  }
  try {
    const hasil = (await runIntradayValidation({
      triggeredBy: 'cron-research-refresh',
      oosOnly: true,
    })) as { status?: string; sample?: { effective?: number } };
    return {
      langkah: 'INTRADAY',
      action: 'CATAT' as const,
      reason: keputusan.reason,
      umurJam: keputusan.umurJam,
      status: hasil?.status ?? null,
      sampelEfektif: hasil?.sample?.effective ?? null,
    };
  } catch (error) {
    // Protokol OOS belum beku = keadaan sah (bukan kegagalan): laporkan sebagai terkendala.
    const pesan = error instanceof Error ? error.message : String(error);
    if (/protokol OOS/i.test(pesan)) {
      return {
        langkah: 'INTRADAY',
        action: 'TERKENDALA' as const,
        reason: 'PROTOKOL_OOS_BELUM_BEKUKU',
        umurJam: keputusan.umurJam,
        status: null,
        sampelEfektif: null,
      };
    }
    throw error;
  }
}

async function handleGET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const hasil = await withJobRunLog(JOB_NAME, async () => {
      const penjaga = await runWithJobConcurrencyGuard(
        JOB_NAME,
        async () => {
          const tpcl = await segarkanTpcl();
          const intraday = await segarkanIntraday();
          return { tpcl, intraday };
        },
        30 * 60
      );
      if (!penjaga.executed) return { dilewati: true, alasan: penjaga.reason };
      return penjaga.value;
    });
    return NextResponse.json({ success: true, job: JOB_NAME, hasil });
  } catch (error) {
    const pesan = error instanceof Error ? error.message : String(error);
    logger.error('research-refresh gagal', { err: error });
    return NextResponse.json({ success: false, error: pesan }, { status: 500 });
  }
}

export function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}