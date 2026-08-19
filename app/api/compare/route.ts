import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { handleGetStockComparison } from '@/modules/comparison/controller/stock-comparison.controller';

export async function GET(request: Request) {
  return runController(() => handleGetStockComparison(request), request);
}
