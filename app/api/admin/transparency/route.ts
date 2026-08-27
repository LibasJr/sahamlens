import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError } from '@/shared/errors/app-error';
import { isAdminFromRequestCookies } from '@/modules/user';
import { getTransparencyData } from '@/modules/lens-radar/service/transparency.service';

export const maxDuration = 300;

// Admin layer: full validation diagnostics for operators. Keep this authenticated
// and do not attach public CDN cache headers to session-dependent responses.
export async function GET(request: Request) {
  return runController(async () => {
    if (!await isAdminFromRequestCookies(await cookies())) throw new ForbiddenError();
    return { status: 200, body: await getTransparencyData() };
  }, request);
}
