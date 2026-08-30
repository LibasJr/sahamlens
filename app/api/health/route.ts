import type { NextRequest } from 'next/server';
import { pool } from '@/shared/database/postgres.client';
import { pingRedis } from '@/shared/cache/redis-cache';
import { listDataSourceHealth } from '@/modules/observability/service/data-source-health.service';
import { runController } from '@/shared/http/next-response.adapter';

export const dynamic = 'force-dynamic';

// Sumber ini sudah tidak dipakai oleh jalur data aktif. Record telemetry lamanya
// dipertahankan untuk audit, tetapi tidak boleh membuat readiness terlihat gagal.
const DEPRECATED_DATA_SOURCE_IDS = new Set(['IDX_PUBLIC_STOCK_SUMMARY']);

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

    const activeDataSources = dataSources.filter((row) => !DEPRECATED_DATA_SOURCE_IDS.has(row.sourceId));
    dataSources = activeDataSources;
    const sourceSummary = activeDataSources.reduce((acc, row) => {
      acc[row.status] += 1;
      return acc;
    }, { HEALTHY: 0, DEGRADED: 0, DOWN: 0, UNKNOWN: 0 } as Record<'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN', number>);
    const sourceDown = activeDataSources.filter((row) => row.status === 'DOWN');
    const sourceWarnings = activeDataSources.filter((row) => row.status === 'DEGRADED' || row.status === 'UNKNOWN');
    // Redis TERLIHAT lewat body.degraded, dan HANYA dianggap degradasi di produksi -
    // tapi TIDAK LAGI menentukan kode status HTTP. Alasannya bukan performa cache -
    // `cacheGet`/`cacheSet` memang sengaja degrade diam-diam ke cache memori dan itu
    // benar. Yang tidak punya cadangan adalah `incrWithExpiry()` (shared/cache/redis-cache.ts):
    // tanpa Redis ia mengembalikan `null`, dan pemanggilnya FAIL-OPEN. Artinya kuota
    // harian dan rate limit berhenti berlaku tanpa satu pun gejala yang terlihat -
    // persis kelas kegagalan diam yang paling mahal di repo ini (CLAUDE.md §7).
    // Sebelum PR #152 `/status` melapor "ok" untuk keadaan itu.
    //
    // KENAPA REDIS TIDAK LAGI MEMICU 503 (2026-08-26, revisi PR #152): 503 dari
    // endpoint ini berarti "jangan kirim trafik ke sini" bagi siapa pun yang
    // membacanya - Cloudflare/load balancer, dan deploy-vps.yml yang menuntut HTTP 200
    // persis sebelum menyatakan deploy sukses (10 percobaan lalu MERAH). Redis di sini
    // murni cache; aplikasi TETAP BISA melayani tanpanya. Membalas 503 untuk itu
    // memblokir pengiriman kode - termasuk perbaikan untuk gangguan Redis itu sendiri -
    // dan memaksa setiap konsumen endpoint ini (JobsMonitorClient, dll) menambal
    // penanganan error satu per satu. Redis mati tetap harus TERLIHAT (body.degraded,
    // body.status='degraded'), tapi lewat body, bukan kode status: pemantau yang
    // peduli (external-health-watch.yml, deploy/uptime-monitor/) membaca body.degraded,
    // bukan HTTP status, persis supaya perbedaan ini tidak menyembunyikan apa pun.
    //
    // Database TETAP satu-satunya alasan 503: kalau database mati, aplikasi memang
    // tidak bisa melayani permintaan nyata - itulah bedanya dengan cache yang sengaja
    // degrade dengan aman.
    const redisDegraded = isProduction() && checks.redis !== 'ok';
    const databaseDown = checks.database !== 'ok';
    const sourceDegradedCount = sourceWarnings.length + sourceDown.length;
    const degraded = [
      ...(databaseDown ? ['database'] : []),
      ...(redisDegraded ? [`redis:${checks.redis}`] : []),
      ...(sourceDegradedCount > 0 ? [`data_source:${sourceDegradedCount}`] : []),
    ];
    return {
      status: databaseDown ? 503 : 200,
      body: {
        status: degraded.length > 0 ? 'degraded' : 'ok',
        checks,
        degraded,
        operationalReadiness: {
          servingTraffic: !databaseDown,
          deployBlocking: databaseDown,
          dataSourceDegraded: sourceDegradedCount > 0,
          dataSourceDegradedCount: sourceDegradedCount,
          dataSourceDown: sourceDown.length > 0,
          dataSourceDownCount: sourceDown.length,
          dataSourceWarningCount: sourceWarnings.length,
        },
        sources: {
          summary: sourceSummary,
          items: dataSources,
          down: sourceDown.map((row) => row.sourceId),
          warnings: sourceWarnings.map((row) => row.sourceId),
        },
        timestamp: new Date().toISOString(),
      },
    };
  }, request);
}
