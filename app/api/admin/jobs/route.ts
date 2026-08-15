import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError } from '@/shared/errors/app-error';
import { isAdminFromRequestCookies } from '@/modules/user';
import { getJobRunOverview } from '@/shared/scheduler/job-run-log.repository';
import { getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { ACTIVE_LIQUID_UNIVERSE_VERSION } from '@/modules/market/constants/ai-pick-universe';
import scheduledJobs from '@/config/scheduled-jobs.json';

export const dynamic = 'force-dynamic';

interface ScheduledJobEntry {
  path: string;
  provider: string;
  schedule: string | null;
  scheduleStatus: string;
}

interface CacheTarget {
  id: string;
  label: string;
  key: string;
  ttlSec: number;
  cronName: string;
}

const CACHE_TARGETS: CacheTarget[] = [
  {
    id: 'screener',
    label: 'LensScanner',
    key: COMPUTED_CACHE_KEY.SCREENER_UNIVERSE,
    ttlSec: CACHE_TTL_SEC.SCREENER_UNIVERSE,
    cronName: 'screener-scan',
  },
  {
    id: 'news',
    label: 'News Intelligence',
    key: COMPUTED_CACHE_KEY.MARKET_NEWS,
    ttlSec: CACHE_TTL_SEC.MARKET_NEWS,
    cronName: 'news',
  },
  {
    id: 'market',
    label: 'Ringkasan Pasar',
    key: COMPUTED_CACHE_KEY.MARKET_SUMMARY,
    ttlSec: CACHE_TTL_SEC.MARKET_SUMMARY_CRON,
    cronName: 'market-summary',
  },
  {
    id: 'lens-radar',
    label: 'LensRadar',
    key: `sahamlens:cache:computed:ai-pick-scores:${ACTIVE_LIQUID_UNIVERSE_VERSION}`,
    ttlSec: CACHE_TTL_SEC.LENS_RADAR_SCORES,
    cronName: 'ai-pick-scan',
  },
];

/** Nama job di job_run_log = segmen terakhir path cron-nya (lihat pemanggilan
 * withJobRunLog di tiap route, mis. '/api/cron/ai-pick-scan' -> 'ai-pick-scan'). */
function jobNameFromPath(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

export async function GET() {
  return runController(async () => {
    if (!await isAdminFromRequestCookies(await cookies())) throw new ForbiddenError();

    const [overview, cacheTtls] = await Promise.all([
      getJobRunOverview(),
      Promise.all(CACHE_TARGETS.map((target) => getCacheTtlRemaining(target.key))),
    ]);
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

    // Jangan kirim key Redis ke browser. Admin cukup butuh hit/miss, estimasi umur
    // cache, sisa TTL, dan worker mana yang seharusnya mengisinya.
    const caches = CACHE_TARGETS.map((target, index) => {
      const ttlRemainingSec = cacheTtls[index];
      const cron = byName.get(target.cronName) ?? null;
      return {
        id: target.id,
        label: target.label,
        state: ttlRemainingSec == null ? 'MISS' : 'HIT',
        cacheAgeSec: ttlRemainingSec == null ? null : Math.max(0, target.ttlSec - ttlRemainingSec),
        ttlRemainingSec,
        lastCronSuccessAt: cron?.last_success_at ?? null,
        lastCronStatus: cron?.last_status ?? null,
      };
    });

    return { status: 200, body: { asOf: new Date().toISOString(), jobs, caches } };
  });
}
