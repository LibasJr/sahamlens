import type { NextRequest } from 'next/server';
import { pool } from '@/shared/database/postgres.client';
import { pingRedis } from '@/shared/cache/redis-cache';
import { listDataSourceHealth } from '@/modules/observability/service/data-source-health.service';
import { runController } from '@/shared/http/next-response.adapter';

export const dynamic = 'force-dynamic';

// Dibaca DI DALAM handler, bukan sebagai konstanta modul: konstanta modul membekukan
// nilainya saat impor pertama, sehingga test tidak bisa menguji cabang produksi tanpa
// memuat ulang modulnya - dan cabang yang tidak bisa diuji akan lolos diam-diam.
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export async function GET(request: NextRequest) {
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

    const sourceSummary = dataSources.reduce((acc, row) => {
      acc[row.status] += 1;
      return acc;
    }, { HEALTHY: 0, DEGRADED: 0, DOWN: 0, UNKNOWN: 0 } as Record<'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN', number>);
    // Redis IKUT menentukan sehat/tidak, dan HANYA di produksi. Alasannya bukan
    // performa cache - `cacheGet`/`cacheSet` memang sengaja degrade diam-diam ke cache
    // memori dan itu benar. Yang tidak punya cadangan adalah `incrWithExpiry()`
    // (shared/cache/redis-cache.ts): tanpa Redis ia mengembalikan `null`, dan pemanggilnya
    // FAIL-OPEN. Artinya kuota harian dan rate limit berhenti berlaku tanpa satu pun
    // gejala yang terlihat - persis kelas kegagalan diam yang paling mahal di repo ini
    // (CLAUDE.md §7). Sebelum ini `/status` melapor "ok" untuk keadaan itu.
    //
    // SENGAJA di /api/health, bukan throw saat boot: Redis di sini murni cache, jadi
    // mematikan seluruh aplikasi saat Redis mati justru menukar degradasi dengan
    // pemadaman. Yang dibutuhkan cuma satu hal - keadaan itu harus TERLIHAT.
    const redisDegraded = isProduction() && checks.redis !== 'ok';
    const healthy = checks.database === 'ok' && !redisDegraded;
    return {
      status: healthy ? 200 : 503,
      body: {
        status: healthy ? 'ok' : 'degraded',
        checks,
        degraded: [
          ...(checks.database === 'ok' ? [] : ['database']),
          ...(redisDegraded ? [`redis:${checks.redis}`] : []),
        ],
        sources: { summary: sourceSummary, items: dataSources },
        timestamp: new Date().toISOString(),
      },
    };
  }, request);
}
