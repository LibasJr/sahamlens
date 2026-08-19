import type { HttpResult } from '@/shared/types/http-result.types';
import { getSession, hasOpenOrProAccess, isAdminServer } from '@/modules/user';
import { readOrIssueAnonymousTrial, buildAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { runLensScoreBucketBacktest } from '../service/lens-score-bucket-backtest.service';
import { logger } from '@/shared/logger/logger';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

function cacheKeyFor(scoreVersion: string | null): string {
  return `sahamlens:cache:computed:lens-score-bucket-backtest:${scoreVersion ?? 'default'}`;
}

export async function handleLensScoreBucketBacktest(request: Request): Promise<HttpResult> {
  try {
    const isInternal = isInternalServiceRequest(request);
    const session = isInternal ? null : await getSession();
    let anonTrial: AnonTrialState | null = null;
    if (!isInternal && !session) anonTrial = await readOrIssueAnonymousTrial();

    if (!isInternal && !(await hasOpenOrProAccess(session))) {
      return { status: 402, body: { error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' } };
    }
    if (!isInternal && !(await isAdminServer()) && session?.role !== 'admin') {
      return { status: 403, body: { error: 'Khusus admin', code: 'ADMIN_REQUIRED' } };
    }

    const scoreVersion = new URL(request.url).searchParams.get('scoreVersion');
    const result = await getOrCompute(
      cacheKeyFor(scoreVersion),
      CACHE_TTL_SEC.LENS_BUCKET_BACKTEST,
      () => runLensScoreBucketBacktest(undefined, { scoreVersion }),
    );
    const cookie = anonTrial ? await buildAnonymousTrialCookie(anonTrial) : null;
    return { status: 200, body: result, cookiesToSet: cookie ? [cookie] : undefined };
  } catch (error) {
    logger.error('GET /api/lens-score-bucket-backtest gagal', { error });
    return { status: 500, body: { error: 'Server Error', code: 'INTERNAL_ERROR' } };
  }
}
