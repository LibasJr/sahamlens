import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { requireAdminSession } from '@/shared/auth/admin-session';
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
    await requireAdminSession();
    const monitor = await getOwnershipFlowMonitor();
    return { status: 200, body: monitor };
  });
}
