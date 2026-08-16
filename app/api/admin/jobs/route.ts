import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError } from '@/shared/errors/app-error';
import { isAdminFromRequestCookies } from '@/modules/user';
import { getJobRunOverview } from '@/shared/scheduler/job-run-log.repository';
import { getCacheTtlRemaining, pingRedis } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { ACTIVE_LIQUID_UNIVERSE_VERSION } from '@/modules/market/constants/ai-pick-universe';
import { inspectAiPickScoresCache } from '@/shared/cache/ai-pick-cache';
import { isTradingDay, isTradingHours } from '@/shared/calendar/idx-trading-calendar';
import scheduledJobs from '@/config/scheduled-jobs.json';

export const dynamic = 'force-dynamic';

interface ScheduledJobEntry {
  path: string;
  provider: string;
  schedule: string | null;
  scheduleStatus: string;
  source: string;
}

interface CacheTarget {
  id: string;
  label: string;
  key: string;
  ttlSec: number;
  cronName: string;
  /** Cache cepat ini memang habis saat worker pasar berhenti, bukan otomatis gangguan. */
  waitForMarketSession?: boolean;
  /** Setelah batas ini, nilai masih sah sebagai sesi terakhir tetapi tidak boleh disebut live. */
  snapshotAfterSec?: number;
}

const CACHE_TARGETS: CacheTarget[] = [
  {
    id: 'screener',
    label: 'LensScanner',
    key: COMPUTED_CACHE_KEY.SCREENER_UNIVERSE,
    ttlSec: CACHE_TTL_SEC.SCREENER_UNIVERSE,
    cronName: 'screener-scan',
    waitForMarketSession: true,
  },
  {
    id: 'news',
    label: 'News Intelligence',
    key: COMPUTED_CACHE_KEY.MARKET_NEWS,
    ttlSec: CACHE_TTL_SEC.MARKET_NEWS,
    cronName: 'news',
    waitForMarketSession: true,
  },
  {
    id: 'market',
    label: 'Ringkasan Pasar',
    key: COMPUTED_CACHE_KEY.MARKET_SUMMARY,
    ttlSec: CACHE_TTL_SEC.MARKET_SUMMARY_CRON,
    cronName: 'market-summary',
    snapshotAfterSec: 20 * 60,
  },
  {
    id: 'lens-radar',
    label: 'LensRadar',
    key: `sahamlens:cache:computed:ai-pick-scores:${ACTIVE_LIQUID_UNIVERSE_VERSION}`,
    ttlSec: CACHE_TTL_SEC.LENS_RADAR_SCORES,
    cronName: 'ai-pick-scan',
    snapshotAfterSec: 20 * 60,
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

    const now = new Date();
    const [overview, redisStatus, cacheTtls, radarSnapshot] = await Promise.all([
      getJobRunOverview(),
      pingRedis(),
      Promise.all(CACHE_TARGETS.map((target) => getCacheTtlRemaining(target.key))),
      inspectAiPickScoresCache(),
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
        source: entry.source,
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
    const outsideMarketSession = !isTradingHours(now);
    const waitingMessage = isTradingDay(now)
      ? 'Cache habis di luar sesi; worker akan mengisinya kembali saat pasar buka.'
      : 'Cache habis; worker menunggu hari bursa berikutnya.';

    const caches = CACHE_TARGETS.map((target, index) => {
      const ttlRemainingSec = cacheTtls[index];
      const cron = byName.get(target.cronName) ?? null;
      const cacheAgeSec = ttlRemainingSec == null ? null : Math.max(0, target.ttlSec - ttlRemainingSec);
      const isLensRadar = target.id === 'lens-radar';
      const radarData = isLensRadar ? radarSnapshot.data : null;
      const radarAgeSec = radarData
        ? Math.max(0, Math.round((now.getTime() - new Date(radarData.computedAt).getTime()) / 1000))
        : null;

      let state: 'HIT' | 'SNAPSHOT' | 'WAITING' | 'MISS' | 'UNAVAILABLE' = 'MISS';
      let detail: string | null = null;
      if (redisStatus !== 'ok') {
        state = 'UNAVAILABLE';
        detail = redisStatus === 'not_configured'
          ? 'Redis belum dikonfigurasi, sehingga cache tidak dapat dipakai.'
          : 'Redis tidak dapat dibaca saat pemeriksaan ini.';
      } else if (isLensRadar && ttlRemainingSec == null && radarData) {
        state = 'SNAPSHOT';
        detail = radarSnapshot.source === 'legacy'
          ? 'Memakai snapshot valid universe sebelumnya sebagai data sesi terakhir.'
          : 'Memakai snapshot sukses terakhir sebagai data sesi terakhir.';
      } else if (ttlRemainingSec == null && target.waitForMarketSession && outsideMarketSession) {
        state = 'WAITING';
        detail = waitingMessage;
      } else if (ttlRemainingSec != null && (
        (isLensRadar && radarAgeSec != null && radarAgeSec > (target.snapshotAfterSec ?? Number.POSITIVE_INFINITY)) ||
        (!isLensRadar && cacheAgeSec != null && cacheAgeSec > (target.snapshotAfterSec ?? Number.POSITIVE_INFINITY))
      )) {
        state = 'SNAPSHOT';
        detail = 'Snapshot sesi terakhir masih tersedia; bukan data live.';
      } else if (ttlRemainingSec != null) {
        state = 'HIT';
      } else {
        detail = 'Cache belum pernah terisi atau worker belum menulis snapshot terbaru.';
      }

      return {
        id: target.id,
        label: target.label,
        state,
        detail,
        cacheAgeSec: isLensRadar && radarAgeSec != null ? radarAgeSec : cacheAgeSec,
        ttlRemainingSec,
        snapshotAt: radarData?.computedAt ?? null,
        universeVersion: radarData?.universeVersion ?? null,
        snapshotSource: radarSnapshot.source,
        lastCronSuccessAt: cron?.last_success_at ?? null,
        lastCronStatus: cron?.last_status ?? null,
      };
    });

    return { status: 200, body: { asOf: new Date().toISOString(), jobs, caches } };
  });
}
