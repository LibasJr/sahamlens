import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { requireAdminSession } from '@/shared/auth/admin-session';
import { getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { listDataSourceHealth } from '@/modules/observability/service/data-source-health.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return runController(async () => {
    await requireAdminSession();

    const cacheEntries = Object.entries(COMPUTED_CACHE_KEY);
    const [ttlRemaining, dataSources] = await Promise.all([
      Promise.all(cacheEntries.map(([, key]) => getCacheTtlRemaining(key))),
      listDataSourceHealth(),
    ]);

    return {
      status: 200,
      body: {
        generatedAt: new Date().toISOString(),
        // Only named computed caches are inspected. Per-ticker/user keys are deliberately excluded.
        caches: cacheEntries.map(([name], index) => ({ name, ttlRemainingSec: ttlRemaining[index] })),
        dataSources: dataSources.map((source) => ({
          sourceId: source.sourceId,
          status: source.status,
          lastSuccessAt: source.lastSuccessAt,
          lastFailureAt: source.lastFailureAt,
          lastLatencyMs: source.lastLatencyMs,
          consecutiveFailures: source.consecutiveFailures,
          dataObservedAt: source.dataObservedAt,
          updatedAt: source.updatedAt,
        })),
      },
    };
  }, request);
}
