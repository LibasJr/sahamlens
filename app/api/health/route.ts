import { runController } from '@/shared/http/next-response.adapter';
import { pool } from '@/shared/database/postgres.client';
import { pingRedis } from '@/shared/cache/redis-cache';
import { listDataSourceHealth } from '@/modules/observability/service/data-source-health.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  return runController(async () => {
  const checks: { database: 'ok' | 'error'; redis: 'ok' | 'not_configured' | 'error' } = { database: 'error', redis: 'not_configured' };
  try { await pool.query('SELECT 1'); checks.database = 'ok'; } catch { checks.database = 'error'; }
  checks.redis = await pingRedis();

  let dataSources: Array<{ sourceId: string; status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN'; lastSuccessAt: string | null; lastFailureAt: string | null; consecutiveFailures: number; dataObservedAt: string | null; updatedAt: string }> = [];
  try {
    dataSources = (await listDataSourceHealth()).map((row) => ({
      sourceId: row.sourceId,
      status: row.status,
      lastSuccessAt: row.lastSuccessAt,
      lastFailureAt: row.lastFailureAt,
      consecutiveFailures: row.consecutiveFailures,
      dataObservedAt: row.dataObservedAt,
      updatedAt: row.updatedAt,
    }));
  } catch { dataSources = []; }

  const sourceSummary = dataSources.reduce((acc, row) => { acc[row.status] += 1; return acc; }, { HEALTHY: 0, DEGRADED: 0, DOWN: 0, UNKNOWN: 0 } as Record<'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN', number>);
  const healthy = checks.database === 'ok';
  // Status 503 dibawa lewat HttpResult.status, bukan NextResponse langsung. Ini BUKAN
  // jalur error: "degraded" adalah jawaban yang sah dan lengkap, jadi tidak boleh
  // dilempar sebagai AppError - pemantauan uptime tetap harus menerima body diagnostik
  // penuh, bukan amplop error generik.
  return {
    status: healthy ? 200 : 503,
    body: {
      status: healthy ? 'ok' : 'degraded',
      checks,
      sources: { summary: sourceSummary, items: dataSources },
      timestamp: new Date().toISOString(),
    },
  };
  });
}
