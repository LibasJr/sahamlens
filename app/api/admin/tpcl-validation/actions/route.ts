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
  clearTpclValidationDashboardCache,
  recomputeTpclValidationDashboard,
} from '../cache';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('run_validation') }),
  z.object({ action: z.literal('clear_cache') }),
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

    if (body.action === 'clear_cache') {
      await clearTpclValidationDashboardCache();
      logger.info('TPCL Validation Lab action', { action: body.action, outcome: 'SUCCESS' });
      return {
        status: 200,
        body: {
          ok: true,
          reason: 'Cache hasil TP/CL Validation Lab dihapus. Histori LensRadar dan parameter production tidak disentuh.',
        },
      };
    }

    const guarded = await runWithJobConcurrencyGuard(
      'tpcl-validation:run_validation',
      () => recomputeTpclValidationDashboard(),
      10 * 60,
    );
    if (!guarded.executed) {
      throw new ConflictError('TP/CL validation sedang dihitung oleh proses lain. Tunggu sampai selesai.');
    }

    logger.info('TPCL Validation Lab action', { action: body.action, outcome: 'SUCCESS' });
    return { status: 200, body: guarded.value };
  }, req);
}
