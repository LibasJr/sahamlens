import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { isAdminFromRequestCookies } from '@/modules/user';
import {
  configurePaperAccount,
  decisionAgentActionSchema,
  executeLiveOrder,
  executePaperOrder,
  getDecisionAgentDashboard,
  proposePaperOrder,
  rejectPaperOrder,
  runDecisionAgentScan,
} from '@/modules/decision-agent';
import { DataUnavailableError, ForbiddenError, ValidationError } from '@/shared/errors/app-error';
import { runController } from '@/shared/http/next-response.adapter';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function assertAdmin(): Promise<void> {
  if (!(await isAdminFromRequestCookies(await cookies()))) throw new ForbiddenError();
}

export async function GET(request: Request) {
  return runController(async () => {
    await assertAdmin();
    return { status: 200, body: await getDecisionAgentDashboard() };
  }, request);
}

export async function POST(request: Request) {
  return runController(async () => {
    await assertAdmin();
    assertTrustedSameOrigin(request);
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new ValidationError('Body harus JSON');
    }
    const input = parseOrThrow(decisionAgentActionSchema, raw);
    let result: unknown = null;

    switch (input.action) {
      case 'scan':
        result = await runDecisionAgentScan({ trigger: 'ADMIN' });
        if (!result) throw new DataUnavailableError('Cache AI Pick aktual belum tersedia; scan tidak membuat sinyal pengganti');
        break;
      case 'configure-paper-account':
        await configurePaperAccount(input.config);
        break;
      case 'propose-paper-order':
        result = await proposePaperOrder(input.signalId);
        break;
      case 'execute-paper-order':
        result = await executePaperOrder(input.orderId);
        break;
      case 'reject-paper-order':
        result = await rejectPaperOrder(input.orderId);
        break;
      case 'execute-live-order':
        result = executeLiveOrder();
        break;
    }

    return { status: 200, body: { result, dashboard: await getDecisionAgentDashboard() } };
  }, request);
}
