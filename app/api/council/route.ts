import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { runCouncilAnalysis } from '@/modules/ai';
import { getSession, checkProAccessLive } from '@/modules/user';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { computeActorFromRequest, consumeComputeBudget } from '@/shared/middleware/compute-budget';
import {
  readOrIssueAnonymousTrial,
  applyAnonymousTrialCookie,
  type AnonTrialState,
} from '@/shared/auth/anonymous-trial';

// LensAI provider cascade can legitimately take longer than the default serverless
// duration. Keep the existing production budget while the heavy analysis itself lives
// in the shared service below the HTTP layer.
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = normalizeIdxTickerParam(url.searchParams.get('symbol') || 'DGWG.JK');
    if (!symbol) {
      return NextResponse.json({ error: 'Ticker tidak valid', code: 'INVALID_TICKER' }, { status: 400 });
    }

    // HTTP/auth/cookie semantics stay in the Route Handler. This is intentionally
    // separate from runCouncilAnalysis(), so authenticated Server Components can call
    // the same analysis directly without self-fetch while anonymous trial users still
    // receive the trial cookie through a real Response object.
    const session = await getSession();
    let anonTrial: AnonTrialState | null = null;

    if (!session) {
      anonTrial = await readOrIssueAnonymousTrial();
      if (!anonTrial.active) {
        return NextResponse.json({ error: 'Belum login' }, { status: 401 });
      }
    }

    const hasPro = anonTrial?.active === true || await checkProAccessLive(session);
    if (!hasPro) {
      return NextResponse.json(
        { error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' },
        { status: 402 },
      );
    }

    const budget = await consumeComputeBudget(
      computeActorFromRequest(req, session?.id),
      5,
      session ? 'authenticated' : 'public',
    );
    if (!budget.allowed) {
      return NextResponse.json(
        { error: 'Analisis berat terlalu sering dijalankan. Coba lagi sebentar.', code: 'COMPUTE_BUDGET_EXCEEDED' },
        { status: 429, headers: budget.retryAfterSec ? { 'Retry-After': String(budget.retryAfterSec) } : undefined },
      );
    }

    const analysis = await runCouncilAnalysis(symbol);
    const response = analysis.ok
      ? NextResponse.json(analysis.data)
      : NextResponse.json(
          { error: analysis.error, code: analysis.code, detail: analysis.detail },
          { status: analysis.status },
        );

    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error) {
    console.error('Council API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
