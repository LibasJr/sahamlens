import { isAdminServer } from '@/modules/user';
import { getShadowLedgerDashboardData } from '@/modules/decision-agent';
import { runController } from '@/shared/http/next-response.adapter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  return runController(async () => {
    if (!(await isAdminServer())) {
      return { status: 401, body: { error: 'Unauthorized' } };
    }
    return { status: 200, body: await getShadowLedgerDashboardData() };
  }, request);
}
