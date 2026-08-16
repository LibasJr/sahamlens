import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError, ValidationError } from '@/shared/errors/app-error';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';
import { isAdminFromRequestCookies } from '@/modules/user';
import { DEFAULT_TPCL_HISTORY_RANGE, type TpclHistoryRange } from '@/modules/recommendation/service/tpcl-validation.service';
import { clearTpclValidationDashboardCache } from '../cache';
import { createTpclValidationRun } from '@/modules/recommendation/repository/tpcl-validation-run.repository';

export const dynamic = 'force-dynamic';
const historyRangeSchema = z.enum(['1y','3y','5y','10y']);
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('run_validation'), historyRange: historyRangeSchema.optional().default(DEFAULT_TPCL_HISTORY_RANGE) }),
  z.object({ action: z.literal('clear_cache'), historyRange: historyRangeSchema.optional().default(DEFAULT_TPCL_HISTORY_RANGE) }),
]);

export async function POST(req: NextRequest) {
  return runController(async () => {
    if (!(await isAdminFromRequestCookies(await cookies()))) throw new ForbiddenError();
    assertTrustedSameOrigin(req);
    let raw: unknown;
    try { raw = await req.json(); } catch { throw new ValidationError('Body harus JSON'); }
    const body = parseOrThrow(bodySchema, raw) as z.infer<typeof bodySchema>;
    const historyRange = body.historyRange as TpclHistoryRange;

    if (body.action === 'clear_cache') {
      await clearTpclValidationDashboardCache(historyRange);
      return {
        status: 200,
        body: {
          ok: true,
          historyRange,
          reason: `Cache hasil TP/CL range ${historyRange} dihapus. Histori, persisted research run, dan parameter production tidak disentuh.`,
        },
      };
    }

    // The web request ONLY queues durable work. A VPS worker claims this row using
    // FOR UPDATE SKIP LOCKED, so browser disconnect/restart cannot silently kill the
    // research job or leave users guessing whether it ran.
    const run = await createTpclValidationRun(historyRange);
    return {
      status: 202,
      body: {
        ok: true,
        runId: run.id,
        historyRange,
        status: 'QUEUED',
        reason: 'Research run tersimpan di antrean database dan akan diproses worker VPS.',
      },
    };
  }, req);
}
