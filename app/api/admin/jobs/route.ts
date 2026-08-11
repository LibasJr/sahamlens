import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError } from '@/shared/errors/app-error';
import { isAdminFromRequestCookies } from '@/modules/user';
import { getJobRunOverview } from '@/shared/scheduler/job-run-log.repository';
import scheduledJobs from '@/config/scheduled-jobs.json';

export const dynamic = 'force-dynamic';

interface ScheduledJobEntry {
  path: string;
  provider: string;
  schedule: string | null;
  scheduleStatus: string;
}

/** Nama job di job_run_log = segmen terakhir path cron-nya (lihat pemanggilan
 * withJobRunLog di tiap route, mis. '/api/cron/ai-pick-scan' -> 'ai-pick-scan'). */
function jobNameFromPath(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

export async function GET() {
  return runController(async () => {
    if (!await isAdminFromRequestCookies(await cookies())) throw new ForbiddenError();

    const overview = await getJobRunOverview();
    const byName = new Map(overview.map((row) => [row.job_name, row]));

    // Didaftar dari config/scheduled-jobs.json, BUKAN dari isi job_run_log. Job yang belum
    // pernah tercatat sekali pun justru yang paling perlu terlihat - kalau daftarnya
    // diturunkan dari tabel log, job yang tidak pernah dipanggil malah menghilang dari layar.
    const jobs = (scheduledJobs.jobs as ScheduledJobEntry[]).map((entry) => {
      const name = jobNameFromPath(entry.path);
      const run = byName.get(name) ?? null;
      return {
        name,
        path: entry.path,
        provider: entry.provider,
        schedule: entry.schedule,
        scheduleStatus: entry.scheduleStatus,
        lastStatus: run?.last_status ?? null,
        lastStartedAt: run?.last_started_at ?? null,
        lastErrorMessage: run?.last_error_message ?? null,
        lastMeta: run?.last_meta ?? null,
        lastSuccessAt: run?.last_success_at ?? null,
        runs24h: run ? Number(run.runs_24h) : 0,
        failures24h: run ? Number(run.failures_24h) : 0,
      };
    });

    return { status: 200, body: { asOf: new Date().toISOString(), jobs } };
  });
}
