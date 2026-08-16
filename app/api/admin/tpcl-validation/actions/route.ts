import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { runController } from '@/shared/http/next-response.adapter';
import { ConflictError, ForbiddenError, ValidationError } from '@/shared/errors/app-error';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { getTrustedAppOrigin } from '@/shared/http/server-origin';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { logger } from '@/shared/logger/logger';
import { isAdminFromRequestCookies } from '@/modules/user';
import {
  DEFAULT_TPCL_HISTORY_RANGE,
  type TpclHistoryRange,
} from '@/modules/recommendation/service/tpcl-validation.service';
import {
  clearTpclValidationDashboardCache,
  recomputeTpclValidationDashboard,
} from '../cache';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const historyRangeSchema = z.enum(['1y', '3y', '5y', '10y']);
const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('run_validation'),
    historyRange: historyRangeSchema.optional().default(DEFAULT_TPCL_HISTORY_RANGE),
  }),
  z.object({
    action: z.literal('clear_cache'),
    historyRange: historyRangeSchema.optional().default(DEFAULT_TPCL_HISTORY_RANGE),
  }),
]);

function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get('origin');
  if (!origin) return;
  const trusted = getTrustedAppOrigin();
  const host = req.headers.get('host');
  const allowed = new Set([
    trusted,
    host ? `https://${host}` : '',
    host ? `http://${host}` : '',
  ].filter(Boolean));
  if (!allowed.has(origin.replace(/\/$/, ''))) {
    throw new ForbiddenError('Origin tidak dikenali');
  }
}

export async function POST(req: NextRequest) {
  return runController(async () => {
    if (!(await isAdminFromRequestCookies(await cookies()))) throw new ForbiddenError();
    assertSameOrigin(req);

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new ValidationError('Body harus JSON');
    }
    const body = parseOrThrow(bodySchema, raw);
    const historyRange = body.historyRange as TpclHistoryRange;

    if (body.action === 'clear_cache') {
      await clearTpclValidationDashboardCache(historyRange);
      logger.info('TPCL Validation Lab action', {
        action: body.action,
        historyRange,
        outcome: 'SUCCESS',
      });
      return {
        status: 200,
        body: {
          ok: true,
          historyRange,
          reason: `Cache hasil TP/CL range ${historyRange} dihapus. Histori LensRadar dan parameter production tidak disentuh.`,
        },
      };
    }

    // Satu lock global sengaja dipakai untuk seluruh range agar dua recompute berbeda
    // tidak mengunduh OHLC Yahoo dalam jumlah besar secara bersamaan.
    const guarded = await runWithJobConcurrencyGuard(
      'tpcl-validation:run_validation',
      () => recomputeTpclValidationDashboard(historyRange),
      10 * 60,
    );
    if (!guarded.executed) {
      throw new ConflictError('TP/CL validation sedang dihitung oleh proses lain. Tunggu sampai selesai.');
    }

    logger.info('TPCL Validation Lab action', {
      action: body.action,
      historyRange,
      outcome: 'SUCCESS',
    });
    return { status: 200, body: guarded.value };
  }, req);
}
