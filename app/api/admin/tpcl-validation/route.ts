import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError } from '@/shared/errors/app-error';
import { isAdminFromRequestCookies } from '@/modules/user';
import { getTpclValidationDashboard } from '@/modules/recommendation/service/tpcl-validation.service';

export const maxDuration = 300;

export async function GET() {
  return runController(async () => {
    if (!await isAdminFromRequestCookies(await cookies())) throw new ForbiddenError();
    const data = await getTpclValidationDashboard();
    return { status: 200, body: data };
  });
}
