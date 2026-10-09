import { NextRequest, NextResponse } from 'next/server';
import { CURRENT_LQ45_UNIVERSE } from '@/modules/market/constants/lq45-universe';
import { computeCurrentFundamentalAnalysis } from '@/modules/fundamental/service/current-fundamental-analysis.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { logger } from '@/shared/logger/logger';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';

export const maxDuration = 300;

/**
 * Pre-warmer cache fundamental untuk emiten LQ45.
 *
 * Menghangatkan kalkulasi fundamental, valuasi, dan rasio LK 45 saham terpopuler
 * ke Redis agar pengguna yang membuka menu /fundamental tidak menanggung cold-cache
 * delay 1.5 - 2.0 detik.
 */
async function runWarm() {
  const warmed: string[] = [];
  const errors: string[] = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < CURRENT_LQ45_UNIVERSE.length; i += BATCH_SIZE) {
    const batch = CURRENT_LQ45_UNIVERSE.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (rawTicker) => {
        const ticker = rawTicker.replace('.JK', '');
        try {
          await getOrCompute(
            `sahamlens:cache:computed:fundamental:${ticker}`,
            CACHE_TTL_SEC.FUNDAMENTAL,
            () => computeCurrentFundamentalAnalysis(ticker),
          );
          warmed.push(ticker);
        } catch (err) {
          logger.warn('Fundamental warmer failed for ticker', { ticker, err });
          errors.push(ticker);
        }
      }),
    );
  }

  return { warmedCount: warmed.length, errorCount: errors.length, sample: warmed.slice(0, 5) };
}

async function handleGET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !timingSafeStringEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const guarded = await runWithJobConcurrencyGuard('fundamental-warmer', () =>
      withJobRunLog('fundamental-warmer', runWarm),
    );
    if (!guarded.executed) {
      return NextResponse.json({ success: true, skipped: true, reason: guarded.reason }, { status: 202 });
    }
    return NextResponse.json({ success: true, result: guarded.value });
  } catch (error) {
    logger.error('Job fundamental-warmer gagal', { err: error });
    return NextResponse.json({ error: 'Job fundamental-warmer gagal' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}
