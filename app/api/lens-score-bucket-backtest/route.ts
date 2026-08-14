import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { runLensScoreBucketBacktest } from '@/modules/recommendation/service/lens-score-bucket-backtest.service';
import { logger } from '@/shared/logger/logger';

export async function GET(request: Request) {
  try {
    const isInternal = isInternalServiceRequest(request);
    const session = isInternal ? null : await getSession();

    // Cookie trial anonim tetap diterbitkan (telemetri), tapi tidak lagi menggerbang
    // akses - lihat hasOpenOrProAccess() untuk alasannya.
    let anonTrial: AnonTrialState | null = null;
    if (!isInternal && !session) anonTrial = await readOrIssueAnonymousTrial();

    if (!isInternal && !(await hasOpenOrProAccess(session))) {
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const scoreVersion = new URL(request.url).searchParams.get('scoreVersion');
    const result = await runLensScoreBucketBacktest(undefined, { scoreVersion });
    const response = NextResponse.json(result);
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error) {
    logger.error('GET /api/lens-score-bucket-backtest gagal', { error });
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
