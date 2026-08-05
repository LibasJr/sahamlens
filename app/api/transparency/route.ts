import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { getTransparencyData } from '@/modules/lens-radar/service/transparency.service';

export const maxDuration = 300;

export async function GET() {
  return runController(async () => ({ status: 200, body: await getTransparencyData() }));
}
