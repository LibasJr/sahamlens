import { guard } from '@/lib/sahamLensGuard';
guard();

import { ARA_SCANNER_POLICY, getAraScannerReadiness } from '@/modules/ara-scanner';
import { requireAdminSession } from '@/shared/auth/admin-session';
import { runController } from '@/shared/http/next-response.adapter';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return runController(async () => {
    await requireAdminSession();
    return {
      status: 200,
      body: {
        readiness: getAraScannerReadiness(),
        policy: ARA_SCANNER_POLICY,
      },
    };
  }, request);
}
