import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError } from '@/shared/errors/app-error';
import { isAdminFromRequestCookies } from '@/modules/user';
import { recommendCalibrationThreshold } from '@/modules/lens-radar/service/calibration.service';

export const maxDuration = 300;

export async function POST() {
  return runController(async () => {
    if (!await isAdminFromRequestCookies(await cookies())) throw new ForbiddenError();
    return { status: 200, body: await recommendCalibrationThreshold() };
  });
}
