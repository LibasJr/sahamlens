import { getSession } from '@/shared/auth/session';
import { ForbiddenError } from '@/shared/errors/app-error';
import { runController } from '@/shared/http/next-response.adapter';
import { pingRedis } from '@/shared/cache/redis-cache';
import { getJobRunOverview } from '@/shared/scheduler/job-run-log.repository';
import { listDataSourceHealth } from '@/modules/observability/service/data-source-health.service';

/** Read-only admin operations overview for the bearer-token desktop client. */
export async function GET(request: Request) {
  return runController(async () => {
    const session = await getSession();
    if (session?.role !== 'admin') throw new ForbiddenError();
    const [redis, jobs, sources] = await Promise.all([pingRedis(), getJobRunOverview(), listDataSourceHealth()]);
    return { status: 200, body: { redis, jobs: jobs.slice(0, 30), sources } };
  }, request);
}
