import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { handleMe } from '@/modules/user';

export async function GET(request: Request) {
  return runController(async () => handleMe(), request);
}
