import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { handleMe } from '@/modules/user';

export async function GET() {
  return runController(async () => handleMe());
}
