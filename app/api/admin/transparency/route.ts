import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { requireAdminSession } from '@/shared/auth/admin-session';
import { getTransparencyData } from '@/modules/lens-radar/service/transparency.service';

export const maxDuration = 300;

// Admin layer: full validation diagnostics for operators. Keep this authenticated
// and do not attach public CDN cache headers to session-dependent responses.
export async function GET(request: Request) {
  return runController(async () => {
    await requireAdminSession();
    return { status: 200, body: await getTransparencyData() };
  }, request);
}
