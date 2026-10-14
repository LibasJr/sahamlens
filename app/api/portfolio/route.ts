import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { handleGetPortfolio } from '@/modules/portfolio';

export async function GET(request: Request) {
  return runController(async () => handleGetPortfolio(), request);
}
