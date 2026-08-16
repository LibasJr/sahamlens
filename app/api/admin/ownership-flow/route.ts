import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError } from '@/shared/errors/app-error';
import { isAdminFromRequestCookies } from '@/modules/user';
import { getOwnershipFlowMonitor } from '@/modules/ownership-flow/service/ownership-flow-monitor.service';

// STATUS INGESTION OWNERSHIP FLOW untuk panel admin.
//
// Dipisahkan dari API publik karena ia menyentuh beberapa query agregat yang
// tidak pantas dijalankan pada tiap request pengunjung, dan karena isinya -
// catatan audit sumber, alasan gerbang, jumlah kegagalan - ditujukan untuk
// operator, bukan pembaca umum.

export const maxDuration = 60;

export async function GET() {
  return runController(async () => {
    if (!(await isAdminFromRequestCookies(await cookies()))) throw new ForbiddenError();
    const monitor = await getOwnershipFlowMonitor();
    return { status: 200, body: monitor };
  });
}
