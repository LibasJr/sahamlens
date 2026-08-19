import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { logger } from '@/shared/logger/logger';
import { runIntradayCollection } from '@/modules/intraday';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';

export const maxDuration = 300;

// Pola gerbang SAMA dengan /api/cron/lens-bucket-backtest: GET + CRON_SECRET untuk
// systemd timer di VPS (penjadwal produksi saat ini), POST + signature QStash kalau
// suatu saat dipindah ke QStash. Slot QStash sudah penuh 10/10, jadi job ini
// dijadwalkan sebagai systemd timer - lihat config/scheduled-jobs.json.
async function isAuthorizedCron(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return timingSafeStringEqual(req.headers.get('authorization') ?? '', `Bearer ${cronSecret}`);
}

async function handleGET(req: NextRequest) {
  if (!(await isAuthorizedCron(req))) {
    logger.warn('Menolak GET /api/cron/intraday-collect - CRON_SECRET tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return jalankan();
}

async function handlePOST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();
  if (!(await verifyQStashSignature(signature, rawBody))) {
    logger.warn('Menolak POST /api/cron/intraday-collect - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return jalankan();
}

async function jalankan() {
  try {
    const result = await withJobRunLog('intraday-collect', async () => {
      const guarded = await runWithJobConcurrencyGuard(
        'intraday-collect',
        () =>
          runIntradayCollection({
            // Rolling window pendek: provider hanya menyimpan 60 hari untuk interval
            // 5 menit, dan job harian cukup mengejar hari-hari terakhir. Backfill
            // 60 hari penuh dijalankan manual dari panel admin.
            lookbackDays: 5,
            budgetMs: 240_000,
          }),
        10 * 60
      );
      if (!guarded.executed) return { skipped: true, reason: 'job_already_running' };
      return guarded.value;
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job intraday-collect gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}

export async function POST(req: NextRequest) {
  return runCronRoute(req, () => handlePOST(req));
}
