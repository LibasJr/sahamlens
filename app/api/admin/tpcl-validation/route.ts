import { guard } from '@/lib/sahamLensGuard';
guard();

import { type NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { ValidationError } from '@/shared/errors/app-error';
import { requireAdminSession } from '@/shared/auth/admin-session';
import {
  DEFAULT_TPCL_HISTORY_RANGE,
  isTpclHistoryRange,
} from '@/modules/recommendation/service/tpcl-validation.service';
import { getCachedTpclValidationDashboard } from './cache';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return runController(async () => {
    await requireAdminSession();

    const rawRange = req.nextUrl.searchParams.get('range') ?? DEFAULT_TPCL_HISTORY_RANGE;
    if (!isTpclHistoryRange(rawRange)) {
      throw new ValidationError('History range TP/CL harus salah satu dari: 1y, 3y, 5y, 10y.');
    }

    const data = await getCachedTpclValidationDashboard(rawRange);
    return { status: 200, body: data };
  }, req);
}
