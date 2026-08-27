import type { HttpResult } from '@/shared/types/http-result.types';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import { logger } from '@/shared/logger/logger';
import { apiOk } from '@/shared/http/api-response';
import { computeActorFromRequest, consumeComputeBudget } from '@/shared/middleware/compute-budget';
import {
  readOrIssueAnonymousTrial,
  buildAnonymousTrialCookie,
  type AnonTrialState,
} from '@/shared/auth/anonymous-trial';
import { readBacktestCache } from '@/modules/backtest';
import { runBacktestSimulation } from '../service/backtest-run.service';

export async function handleRunBacktest(request: Request): Promise<HttpResult> {
  try {
    const session = await getSession();
    let anonTrial: AnonTrialState | null = null;
    if (!session) anonTrial = await readOrIssueAnonymousTrial();

    if (!(await hasOpenOrProAccess(session))) {
      return { status: 402, body: { error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' } };
    }

    const cachedBacktest = await readBacktestCache();
    const actor = session?.id
      ? computeActorFromRequest(request, session.id)
      : anonTrial
        ? `guest:${anonTrial.firstSeenAt}`
        : computeActorFromRequest(request);
    const budget = await consumeComputeBudget(actor, cachedBacktest ? 2 : 10, 'authenticated');
    if (!budget.allowed) {
      return {
        status: 429,
        body: { error: 'Terlalu banyak komputasi berat dalam waktu singkat. Coba lagi sebentar.', code: 'COMPUTE_BUDGET_EXCEEDED' },
        headers: budget.retryAfterSec ? { 'Retry-After': String(budget.retryAfterSec) } : undefined,
      };
    }

    const result = await runBacktestSimulation(await request.json(), {
      cachedBacktest,
      isGuest: !session || typeof session.id !== 'string',
    });
    if (!result.ok) return { status: result.status, body: result.body };

    const cookie = anonTrial ? await buildAnonymousTrialCookie(anonTrial) : null;
    const dataAsOf = typeof result.body.dataAsOf === 'string' ? result.body.dataAsOf : undefined;
    return {
      status: 200,
      body: {
        ...result.body,
        ...apiOk(result.body, {
          dataAsOf,
          source: cachedBacktest ? 'backtest-indicator-cache' : 'backtest-simulation',
        }),
      },
      cookiesToSet: cookie ? [cookie] : undefined,
    };
  } catch (error) {
    logger.error('Backtest gagal', { err: error });
    return { status: 500, body: { error: 'Server Error' } };
  }
}
