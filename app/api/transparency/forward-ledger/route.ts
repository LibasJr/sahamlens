import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { checkPublicComputeBudget, rateLimitResult } from '@/shared/security/api-rate-limit';
import { getForwardLedgerTransparencySummary } from '@/modules/decision-agent';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Public read-only forward paper-trade ledger summary (point-in-time OOS validation).
// Protected by public compute budget rate limiter; parameter request is non-optional.
export async function GET(request: Request) {
  return runController(async () => {
    const budget = await checkPublicComputeBudget(request.headers, 'forward-ledger');
    if (!budget.allowed) {
      return rateLimitResult(budget, 'Terlalu banyak permintaan forward ledger.');
    }

    const data = await getForwardLedgerTransparencySummary();
    return {
      status: 200,
      body: data,
    };
  }, request);
}
