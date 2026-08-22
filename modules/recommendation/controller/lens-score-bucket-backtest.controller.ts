import type { HttpResult } from '@/shared/types/http-result.types';
import { getSession, hasOpenOrProAccess, isAdminServer } from '@/modules/user';
import { readOrIssueAnonymousTrial, buildAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { runLensScoreBucketBacktest } from '../service/lens-score-bucket-backtest.service';
import { logger } from '@/shared/logger/logger';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { SCORE_VERSION } from '@/modules/lens-radar/constants/model-version';
import { LENS_SCORE_MODEL_METADATA } from '@/modules/technical/config/lens-score-model';

function cacheKeyFor(scoreVersion: string | null, scoreConfigHash: string | null): string {
  return `sahamlens:cache:computed:lens-score-bucket-backtest:${scoreVersion ?? 'default'}:${scoreConfigHash ?? 'default'}`;
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

    const searchParams = new URL(request.url).searchParams;
    const scoreVersion = searchParams.get('scoreVersion')?.trim() || SCORE_VERSION;
    const scoreConfigHash = searchParams.get('scoreConfigHash')?.trim() || LENS_SCORE_MODEL_METADATA.configHash;
    const result = await getOrCompute(
      cacheKeyFor(scoreVersion, scoreConfigHash),
      CACHE_TTL_SEC.LENS_BUCKET_BACKTEST,
      () => runLensScoreBucketBacktest(undefined, { scoreVersion, scoreConfigHash }),
    );
    const cookie = anonTrial ? await buildAnonymousTrialCookie(anonTrial) : null;
    return { status: 200, body: result, cookiesToSet: cookie ? [cookie] : undefined };
  } catch (error) {
    logger.error('GET /api/lens-score-bucket-backtest gagal', { error });
    return { status: 500, body: { error: 'Server Error', code: 'INTERNAL_ERROR' } };
  }
}
