import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { handleAdminStats } from '@/modules/user';

export async function GET() {
  return runController(async () => handleAdminStats(cookies()));
}
