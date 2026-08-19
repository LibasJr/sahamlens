import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { handleGetPortfolio } from '@/modules/portfolio';

// Compatibility alias. Keep the same controller as /api/portfolio while routing the
// response through the standard adapter so request-id/error contracts cannot drift.
export async function GET(request: Request) {
  return runController(async () => handleGetPortfolio(), request);
}
