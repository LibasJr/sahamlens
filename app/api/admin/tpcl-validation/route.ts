import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { type NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError, ValidationError } from '@/shared/errors/app-error';
import { isAdminFromRequestCookies } from '@/modules/user';
import {
  DEFAULT_TPCL_HISTORY_RANGE,
  isTpclHistoryRange,
} from '@/modules/recommendation/service/tpcl-validation.service';
import { getCachedTpclValidationDashboard } from './cache';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return runController(async () => {
    if (!await isAdminFromRequestCookies(await cookies())) throw new ForbiddenError();

    const rawRange = req.nextUrl.searchParams.get('range') ?? DEFAULT_TPCL_HISTORY_RANGE;
    if (!isTpclHistoryRange(rawRange)) {
      throw new ValidationError('History range TP/CL harus salah satu dari: 1y, 3y, 5y, 10y.');
    }

    const data = await getCachedTpclValidationDashboard(rawRange);
    return { status: 200, body: data };
  }, req);
}
