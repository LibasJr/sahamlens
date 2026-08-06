import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError } from '@/shared/errors/app-error';
import { isAdminFromRequestCookies } from '@/modules/user';
import { getCalibrationDashboardData } from '@/modules/lens-radar/service/calibration.service';
import { getLatestWeightProposal } from '@/modules/lens-radar/service/lens-score-optimizer.service';

export const maxDuration = 300;

export async function GET() {
  return runController(async () => {
    if (!await isAdminFromRequestCookies(await cookies())) throw new ForbiddenError();
    const [calibration, latestWeightProposal] = await Promise.all([
      getCalibrationDashboardData(),
      getLatestWeightProposal(),
    ]);
    return { status: 200, body: { ...calibration, latestWeightProposal } };
  });
}
